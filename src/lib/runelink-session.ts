import {
  RunelinkConnection,
  RunelinkIncompatibleHostError,
  getWsUrl,
  type CapabilityIssue,
  type ReplyFor,
  type RunelinkConnectionIssue,
  type RunelinkRequestFailure,
  type UserRef,
  type WsRequest,
} from "@runelink/sdk";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import type * as Fiber from "effect/Fiber";
import * as FiberSet from "effect/FiberSet";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import type * as Socket from "effect/socket/Socket";
import {
  appAtomRegistry,
  getState,
  setState,
  stateAtom,
} from "@/lib/atom-registry";
import { checkAccountDeleted } from "@/lib/account-deletion";
import {
  normalizeAccountInput,
  sameUserRef,
  type StoredAccountAuth,
} from "@/lib/account-storage";
import {
  authAtom,
  clearAccountAuth,
  followStoredAuth,
  getActiveAccount,
  getActiveAccountAuth,
  isSavedAccount,
  persistAuthenticatedAccount,
  setAuthError,
  storeAccountToken,
} from "@/lib/auth-store";
import { handleRunelinkUpdate } from "@/lib/runelink-updates";
import {
  HostTransportError,
  HostUnreachableError,
  resolveHostTransport,
} from "@/lib/host-transport";

type AccountConnectionStatus =
  | "disconnected"
  | "connecting"
  | "reconnecting"
  | "unauthenticated"
  | "authenticating"
  | "connected";

type ConnectionState = {
  status: AccountConnectionStatus;
  lastError: string | null;
  connectedAccount: UserRef | null;
  capabilityIssues: ReadonlyArray<CapabilityIssue>;
  incompatibleHost: string | null;
};

export const connectionAtom = stateAtom<ConnectionState>({
  status: "disconnected",
  lastError: null,
  connectedAccount: null,
  capabilityIssues: [],
  incompatibleHost: null,
});

// The active session cannot be used, or changed while it was being used.
export class SessionError extends Schema.TaggedError<SessionError>()(
  "SessionError",
  { message: Schema.String }
) {}

// An account name or host that cannot be used to sign in
class InvalidAccountError extends Schema.TaggedError<InvalidAccountError>()(
  "InvalidAccountError",
  { message: Schema.String }
) {}

export type RequestFailure = RunelinkRequestFailure | SessionError;
type ConnectFailure =
  | RunelinkRequestFailure
  | SessionError
  | HostUnreachableError
  | HostTransportError;
type AuthFailure = ConnectFailure | InvalidAccountError;

type AccountCredentials = {
  host: string;
  name: string;
  password: string;
};

type Connection = RunelinkConnection.RunelinkConnection["Service"];

export class RunelinkSession extends Context.Service<
  RunelinkSession,
  {
    // Waits for the active account's connection, then sends the request.
    readonly request: <Request extends WsRequest>(
      request: Request
    ) => Effect.Effect<ReplyFor<Request["type"]>, RequestFailure>;
    readonly login: (
      credentials: AccountCredentials
    ) => Effect.Effect<void, AuthFailure>;
    readonly signup: (
      credentials: AccountCredentials
    ) => Effect.Effect<void, AuthFailure>;
    // Cancels a login or signup that is still connecting.
    readonly cancelPendingAuthentication: Effect.Effect<void>;
  }
>()("runelink-demo/RunelinkSession") {}

export function request<Request extends WsRequest>(
  message: Request
): Effect.Effect<ReplyFor<Request["type"]>, RequestFailure, RunelinkSession> {
  return Effect.flatMap(RunelinkSession, (session) => session.request(message));
}

export const login = (credentials: AccountCredentials) =>
  Effect.flatMap(RunelinkSession, (session) => session.login(credentials));

export const signup = (credentials: AccountCredentials) =>
  Effect.flatMap(RunelinkSession, (session) => session.signup(credentials));

export const cancelPendingAuthentication = Effect.flatMap(
  RunelinkSession,
  (session) => session.cancelPendingAuthentication
);

const AUTH_REQUEST_TIMEOUT_MS = 10_000;
// After this long in the background (e.g. sleep), the socket may look open
// while no longer delivering messages, so it is replaced on return.
const RESUME_RECONNECT_AFTER_MS = 60_000;
const AUTH_RETRY_INITIAL_DELAY_MS = 1_000;
const AUTH_RETRY_MAX_DELAY_MS = 30_000;
// Error codes the host returns when a refresh token is unknown, expired, or
// revoked. Anything else (network failures, timeouts, internal errors) is
// treated as transient so the stored session survives it.
const AUTH_REJECTION_ERROR_CODES = new Set(["auth_error", "not_found"]);

function isAuthRejection(error: ConnectFailure): boolean {
  return (
    error._tag === "RunelinkRequestError" &&
    AUTH_REJECTION_ERROR_CODES.has(error.code)
  );
}

function setConnectionState(patch: Partial<ConnectionState>): void {
  setState(connectionAtom, patch);
}

function getConnectedAccount(): UserRef | null {
  return getState(connectionAtom).connectedAccount;
}

function getAuthSnapshot() {
  const state = getState(authAtom);
  return {
    activeAccount: getActiveAccount(state),
    activeAuth: getActiveAccountAuth(state),
    authError: state.authError,
  };
}

// Whether `auth` is still the active session. Syncs can outlive a logout or
// account switch (e.g. while waiting out a host outage), and must not restore
// the old session when they resume.
function isActiveSession(userRef: UserRef, auth: StoredAccountAuth): boolean {
  const { activeAccount, activeAuth } = getAuthSnapshot();
  return (
    sameUserRef(activeAccount, userRef) &&
    activeAuth?.refresh_token === auth.refresh_token
  );
}

function getActiveSessionKey(): string | null {
  const { activeAccount, activeAuth } = getAuthSnapshot();
  if (!activeAccount) {
    return null;
  }

  return JSON.stringify({
    user: activeAccount,
    auth: activeAuth
      ? {
          refresh_token: activeAuth.refresh_token,
          access_token: activeAuth.access_token ?? null,
          expires_at: activeAuth.expires_at ?? null,
          client_id: activeAuth.client_id ?? null,
          scope: activeAuth.scope ?? null,
        }
      : null,
  });
}

// Fails before anything is sent, e.g. so signup cannot create an account that
// cannot then log in.
const requireCapabilities = Effect.fn("RunelinkSession.requireCapabilities")(
  function* (connection: Connection, host: string, capabilities: string[]) {
    const issues = Option.getOrElse(
      yield* connection.capabilityIssues,
      () => []
    ).filter((issue) => capabilities.includes(issue.capability));
    if (issues.length > 0) {
      return yield* new RunelinkIncompatibleHostError({
        host,
        reason: issues.map((issue) => issue.message).join("; "),
      });
    }
  }
);

function authTimeout(message: string) {
  return Effect.timeoutOrElse({
    duration: AUTH_REQUEST_TIMEOUT_MS,
    orElse: () => Effect.fail(new SessionError({ message })),
  });
}

const authenticateWithAccessToken = Effect.fn(
  "RunelinkSession.authenticateWithAccessToken"
)(function* (connection: Connection, userRef: UserRef, accessToken: string) {
  const reply = yield* connection
    .request({
      type: "auth_token_access",
      data: { access_token: accessToken },
    })
    .pipe(authTimeout("Timed out authenticating websocket"));

  if (
    reply.data.type !== "authenticated" ||
    !sameUserRef(reply.data.data.user_ref, userRef)
  ) {
    return yield* new SessionError({
      message: "Websocket authentication returned an unexpected account",
    });
  }
});

const authenticateWithRefreshToken = Effect.fn(
  "RunelinkSession.authenticateWithRefreshToken"
)(function* (
  connection: Connection,
  userRef: UserRef,
  auth: StoredAccountAuth
) {
  const clientId = auth.client_id ?? crypto.randomUUID();
  const reply = yield* connection
    .request({
      type: "auth_token_refresh",
      data: {
        refresh_token: auth.refresh_token,
        client_id: auth.client_id ?? null,
        scope: auth.scope ?? null,
      },
    })
    .pipe(authTimeout("Timed out refreshing session"));

  if (!isActiveSession(userRef, auth)) {
    return yield* new SessionError({
      message: "Session changed while refreshing",
    });
  }
  yield* saveSession(() => storeAccountToken(userRef, reply.data, clientId));
  // The host replaces the refresh token, so the session continues with the
  // new one.
  return { ...auth, refresh_token: reply.data.refresh_token };
});

// The message of a failure, or of an unexpected error, to show the user
export function failureMessage(
  cause: Cause.Cause<unknown>,
  fallback: string
): string {
  const error = Cause.squash(cause);
  return error instanceof Error ? error.message : fallback;
}

// Shows why a login or signup failed on the auth screen
const showAuthError =
  (fallback: string) =>
  <A, E, R>(self: Effect.Effect<A, E, R>) =>
    Effect.tapCause(self, (cause) =>
      Cause.hasInterruptsOnly(cause)
        ? Effect.void
        : Effect.sync(() => setAuthError(failureMessage(cause, fallback)))
    );

// Storage can throw, such as when it is full.
const saveSession = (save: () => void) =>
  Effect.try({
    try: save,
    catch: (error) =>
      new SessionError({
        message:
          error instanceof Error ? error.message : "Unable to save the session",
      }),
  });

const transportCancelled = () =>
  new SessionError({ message: "The connection attempt was cancelled." });

// An unexpected error in a listener is logged rather than stopping it.
const logDefect = Effect.catchDefect((defect) =>
  Effect.logError("RuneLink listener failed", defect)
);

const normalizeCredentials = (credentials: AccountCredentials) =>
  Effect.try({
    try: () => normalizeAccountInput(credentials),
    catch: (error) =>
      new InvalidAccountError({
        message: error instanceof Error ? error.message : "Invalid account",
      }),
  });

const make = Effect.gen(function* () {
  const layerScope = yield* Effect.scope;
  const context = yield* Effect.context<Socket.WebSocketConstructor>();
  // Runs effects from browser and atom listeners until the layer closes
  const run = yield* FiberSet.makeRuntime();

  let current:
    | { host: string; connection: Connection; scope: Scope.Closeable }
    | undefined;
  let currentAuthenticated = false;
  // Cancels the host transport check of the connection being replaced
  let cancelTransport: Deferred.Deferred<never, SessionError> | undefined;
  let replaceInProgress = false;
  let explicitAuthenticationInProgress = false;
  let syncGeneration = 0;
  let syncing: Deferred.Deferred<void> | undefined;
  let syncQueued = false;
  let authRetryAttempt = 0;
  let authRetry: Fiber.Fiber<void> | undefined;
  let hiddenAt: number | null = null;

  const isCurrent = (connection: Connection) =>
    current?.connection === connection;

  function connectionMatches(userRef: UserRef): boolean {
    return sameUserRef(getConnectedAccount(), userRef);
  }

  function setUnauthenticatedStatus(status: AccountConnectionStatus): void {
    currentAuthenticated = false;
    setConnectionState({ status, connectedAccount: null });
  }

  function setAuthenticatedStatus(userRef: UserRef): void {
    currentAuthenticated = true;
    authRetryAttempt = 0;
    setConnectionState({
      status: "connected",
      lastError: null,
      connectedAccount: userRef,
    });
  }

  function cancelHostTransport(): void {
    const cancel = cancelTransport;
    cancelTransport = undefined;
    // Fails after the caller continues, like an aborted fetch, so the
    // cancelled attempt cannot resume inside the caller.
    if (cancel) {
      queueMicrotask(() =>
        Deferred.doneUnsafe(cancel, Exit.fail(transportCancelled()))
      );
    }
  }

  // Synchronous, as before, so nothing can start between a teardown and the
  // attempt that follows it.
  function teardownConnection(): void {
    cancelHostTransport();
    closeConnection();
  }

  function closeConnection(): void {
    authRetry?.interruptUnsafe();
    authRetry = undefined;
    const previous = current;
    current = undefined;
    currentAuthenticated = false;
    replaceInProgress = false;
    setConnectionState({ capabilityIssues: [], incompatibleHost: null });
    // Closing the scope disconnects the socket and stops its listeners.
    if (previous) run(Scope.close(previous.scope, Exit.void));
  }

  // Starts a sync, or queues one to run after the running sync, and returns
  // the running sync's completion.
  // Uninterruptible until the sync is running, so `syncing` is never set
  // without one.
  const startSync: Effect.Effect<Deferred.Deferred<void>> = Effect.suspend(
    () => {
      if (syncing) {
        syncQueued = true;
        return Effect.succeed(syncing);
      }
      const done = Deferred.makeUnsafe<void>();
      syncing = done;
      return syncConnectionToActiveAccount.pipe(
        // Failures are reflected in the connection state, and unexpected
        // errors must not stop the queued sync.
        Effect.catchDefect((defect) =>
          Effect.logError("RuneLink sync failed", defect)
        ),
        Effect.ensuring(
          Effect.suspend(() => {
            syncing = undefined;
            // The queued sync starts before waiters resume, as it did before.
            const next = syncQueued ? triggerSync : Effect.void;
            syncQueued = false;
            return next.pipe(
              Effect.ensuring(
                Effect.sync(() => Deferred.doneUnsafe(done, Exit.void))
              )
            );
          })
        ),
        // Runs until it first waits before returning, as the old sync did, so
        // its first steps cannot undo work started right after
        Effect.forkIn(layerScope, { startImmediately: true }),
        Effect.as(done)
      );
    }
  ).pipe(Effect.uninterruptible);
  const triggerSync = Effect.asVoid(startSync);
  // Waits for the running sync only, not a follow-up it queues
  const syncAndWait = Effect.flatMap(startSync, Deferred.await);

  const handleStatus = Effect.fn("RunelinkSession.handleStatus")(function* (
    connection: Connection,
    status: RunelinkConnection.Status
  ) {
    if (!isCurrent(connection)) return;

    if (status === "connected") {
      setConnectionState({
        capabilityIssues: Option.getOrElse(
          yield* connection.capabilityIssues,
          () => []
        ),
      });
      if (currentAuthenticated) {
        const connectedAccount = getConnectedAccount();
        if (connectedAccount) {
          setConnectionState({
            status: "connected",
            lastError: null,
            connectedAccount,
          });
        }
        return;
      }

      setUnauthenticatedStatus("unauthenticated");
      if (!replaceInProgress) yield* triggerSync;
      return;
    }

    setUnauthenticatedStatus(status);
  });

  function handleConnectionIssue(
    connection: Connection,
    error: RunelinkConnectionIssue
  ): void {
    if (!isCurrent(connection)) return;
    setConnectionState({
      lastError: error.message,
      ...(error._tag === "RunelinkIncompatibleHostError"
        ? { incompatibleHost: error.message }
        : {}),
    });
  }

  function markReplacementFailed(cause: Cause.Cause<unknown>): void {
    replaceInProgress = false;
    setConnectionState({
      status: "disconnected",
      lastError: failureMessage(cause, "Unable to connect"),
      connectedAccount: null,
    });
  }

  const replaceConnection = Effect.fn("RunelinkSession.replaceConnection")(
    function* (host: string) {
      // Owns the next host check before closing the old connection, since
      // the requests that closing fails can start another attempt, which
      // then supersedes this one.
      cancelHostTransport();
      const cancel = Deferred.makeUnsafe<never, SessionError>();
      cancelTransport = cancel;
      closeConnection();
      if (cancelTransport !== cancel) return yield* transportCancelled();
      replaceInProgress = true;

      const secure = yield* Effect.raceFirst(
        resolveHostTransport(host),
        Deferred.await(cancel)
      ).pipe(
        Effect.onError((cause) =>
          Effect.sync(() => {
            if (cancelTransport !== cancel) return;
            cancelTransport = undefined;
            markReplacementFailed(cause);
          })
        )
      );
      if (cancelTransport !== cancel) return yield* transportCancelled();
      cancelTransport = undefined;

      const scope = yield* Scope.fork(layerScope);
      // Explicit URL mode prevents the SDK from silently falling back to
      // ws://. Browser WebSockets reject redirects during their handshake.
      const connection = yield* RunelinkConnection.make({
        url: getWsUrl(host, secure),
        autoReconnect: true,
        transportSecurity: "secure-only",
      }).pipe(Scope.provide(scope), Effect.provideContext(context));
      current = { host, connection, scope };

      const listen = Effect.forkIn(scope, { startImmediately: true });
      // A new connection starts out disconnected, which would reject waiters,
      // so its status is followed from when it starts connecting.
      yield* connection.statusChanges.pipe(
        Stream.dropWhile((status) => status === "disconnected"),
        Stream.runForEach((status) =>
          handleStatus(connection, status).pipe(logDefect)
        ),
        listen
      );
      yield* connection.errors.pipe(
        Stream.runForEach((error) =>
          Effect.sync(() => handleConnectionIssue(connection, error)).pipe(
            logDefect
          )
        ),
        listen
      );
      yield* connection.updates.pipe(
        Stream.runForEach((update) =>
          Effect.gen(function* () {
            if (!isCurrent(connection)) return;
            handleRunelinkUpdate(update);
            // Hosts relay deletions reported by their peers without verifying
            // them, so a deletion update only triggers a check with the
            // user's home host.
            if (
              update.type === "user_deleted" &&
              isSavedAccount(update.data.user_ref)
            ) {
              yield* Effect.forkIn(
                checkAccountDeleted(update.data.user_ref),
                layerScope
              );
            }
          }).pipe(logDefect)
        ),
        listen
      );

      yield* connection.connect.pipe(
        Effect.onError((cause) =>
          Effect.sync(() => {
            if (isCurrent(connection)) markReplacementFailed(cause);
          })
        )
      );
      if (isCurrent(connection)) replaceInProgress = false;
      return connection;
    }
  );

  const scheduleAuthRetry = Effect.fn("RunelinkSession.scheduleAuthRetry")(
    function* (errorMessage: string) {
      teardownConnection();
      setConnectionState({
        status: "reconnecting",
        lastError: errorMessage,
        connectedAccount: null,
      });

      authRetryAttempt += 1;
      const delayMs = Math.min(
        AUTH_RETRY_INITIAL_DELAY_MS * 2 ** (authRetryAttempt - 1),
        AUTH_RETRY_MAX_DELAY_MS
      );
      authRetry = yield* Effect.sleep(delayMs).pipe(
        Effect.andThen(triggerSync),
        Effect.forkIn(layerScope)
      );
    }
  );

  const authenticateStoredAccount = Effect.fn(
    "RunelinkSession.authenticateStoredAccount"
  )(function* (
    connection: Connection,
    userRef: UserRef,
    auth: StoredAccountAuth
  ) {
    setConnectionState({
      status: "authenticating",
      lastError: null,
      connectedAccount: null,
    });

    // Succeeds with the session, whose refresh token a refresh replaces
    const exit = yield* Effect.exit(
      Effect.gen(function* () {
        // Refresh-token sign-in is the fallback for every stored session.
        yield* requireCapabilities(connection, userRef.host, ["auth.token"]);
        const refresh = authenticateWithRefreshToken(connection, userRef, auth);
        const nowInSeconds = Math.floor(Date.now() / 1000);
        if (
          !auth.access_token ||
          (auth.expires_at && auth.expires_at <= nowInSeconds + 60)
        ) {
          return yield* refresh;
        }
        return yield* authenticateWithAccessToken(
          connection,
          userRef,
          auth.access_token
        ).pipe(
          Effect.as(auth),
          Effect.catchCause((cause) =>
            // Sending on a replaced connection would reopen it, and an
            // incompatible host would fail the refresh the same way.
            Cause.hasInterrupts(cause) ||
            !isCurrent(connection) ||
            Option.getOrUndefined(Cause.findErrorOption(cause))?._tag ===
              "RunelinkIncompatibleHostError"
              ? Effect.failCause(cause)
              : refresh
          )
        );
      })
    );

    const session = Exit.isSuccess(exit) ? exit.value : auth;
    if (
      !isCurrent(connection) ||
      !isActiveSession(userRef, session) ||
      Exit.hasInterrupts(exit)
    ) {
      return;
    }
    if (Exit.isSuccess(exit)) {
      setAuthenticatedStatus(userRef);
      return;
    }
    // Unexpected errors are retried like transient failures.
    const error = Option.getOrUndefined(Exit.findErrorOption(exit));
    const errorMessage = failureMessage(
      exit.cause,
      "Unable to authenticate websocket"
    );

    if (error?._tag === "RunelinkIncompatibleHostError") {
      // Retrying cannot help until the host is updated, so keep the stored
      // session and wait for the next explicit sync.
      setConnectionState({
        status: "disconnected",
        lastError: errorMessage,
        connectedAccount: null,
        incompatibleHost: errorMessage,
      });
      run(connection.disconnect);
      return;
    }

    if (!error || !isAuthRejection(error)) {
      // Keep the stored refresh token and try again on a fresh socket. This
      // covers dropped or half-open sockets, timeouts, and host restarts.
      yield* scheduleAuthRetry(errorMessage);
      return;
    }

    clearAccountAuth(userRef, errorMessage);
    run(connection.disconnect);
    // The session may have been rejected because the user was deleted while
    // this browser was offline.
    yield* Effect.forkIn(checkAccountDeleted(userRef), layerScope);
    setConnectionState({
      status: "disconnected",
      lastError: errorMessage,
      connectedAccount: null,
    });
  });

  const syncConnectionToActiveAccount: Effect.Effect<void> = Effect.gen(
    function* () {
      // Requests compare this to tell whether a sync ran while they waited.
      syncGeneration += 1;
      const { activeAccount, activeAuth, authError } = getAuthSnapshot();

      if (!activeAccount || !activeAuth) {
        teardownConnection();
        setConnectionState({
          status: "disconnected",
          lastError: authError,
          connectedAccount: null,
        });
        return;
      }

      const { status } = getState(connectionAtom);
      const reusable =
        current?.host === activeAccount.host &&
        !(currentAuthenticated && !connectionMatches(activeAccount)) &&
        (status === "connected" || status === "unauthenticated")
          ? current.connection
          : undefined;
      const socket = reusable
        ? Option.some(reusable)
        : yield* replaceConnection(activeAccount.host).pipe(
            Effect.map(Option.some),
            // Failures are reflected in the connection state.
            Effect.catch((error) =>
              error._tag === "HostUnreachableError" &&
              isActiveSession(activeAccount, activeAuth) &&
              !explicitAuthenticationInProgress
                ? scheduleAuthRetry(error.message).pipe(
                    Effect.as(Option.none())
                  )
                : Effect.succeedNone
            )
          );
      if (Option.isNone(socket) || !isCurrent(socket.value)) return;

      if (connectionMatches(activeAccount) && currentAuthenticated) {
        if (status !== "connected") {
          setAuthenticatedStatus(activeAccount);
        }
        return;
      }

      yield* authenticateStoredAccount(socket.value, activeAccount, activeAuth);
    }
  ).pipe(Effect.withSpan("RunelinkSession.sync"));

  // Waits until the account is connected, or fails once disconnected
  const waitForConnectedAccount = (account: UserRef | null) =>
    Effect.callback<Connection, SessionError>((resume) => {
      function check(state: ConnectionState): boolean {
        if (
          current &&
          account &&
          state.status === "connected" &&
          sameUserRef(state.connectedAccount, account)
        ) {
          resume(Effect.succeed(current.connection));
          return true;
        }
        if (state.status === "disconnected") {
          resume(
            Effect.fail(
              new SessionError({
                message:
                  state.lastError ?? "RuneLink connection is not available",
              })
            )
          );
          return true;
        }
        return false;
      }

      if (check(getState(connectionAtom))) return;
      const unsubscribe = appAtomRegistry.subscribe(connectionAtom, (state) => {
        if (check(state)) unsubscribe();
      });
      return Effect.sync(unsubscribe);
    });

  const waitForAuthenticatedConnection = Effect.gen(function* () {
    const activeAccount = getAuthSnapshot().activeAccount;
    if (activeAccount && connectionMatches(activeAccount) && current) {
      return current.connection;
    }

    yield* syncAndWait;

    const nextActiveAccount = getAuthSnapshot().activeAccount;
    if (nextActiveAccount && connectionMatches(nextActiveAccount) && current) {
      return current.connection;
    }
    return yield* waitForConnectedAccount(nextActiveAccount);
  });

  const sendRequest = Effect.fn("RunelinkSession.request")(function* <
    Request extends WsRequest,
  >(
    message: Request
  ): Effect.fn.Return<ReplyFor<Request["type"]>, RequestFailure> {
    const generation = syncGeneration;
    const connection = yield* waitForAuthenticatedConnection;
    if (generation !== syncGeneration || !isCurrent(connection)) {
      return yield* new SessionError({
        message: "RuneLink connection changed before request could be sent",
      });
    }
    return yield* connection.request(message);
  });

  // Signs in to an account the user entered, replacing the active connection
  function passwordAuth(signup: boolean) {
    const fallbackError = signup
      ? "Unable to create account"
      : "Unable to log in";
    return Effect.fn(
      signup ? "RunelinkSession.signup" : "RunelinkSession.login"
    )(function* (credentials: AccountCredentials) {
      const userRef = yield* normalizeCredentials(credentials);
      const { password } = credentials;
      const clientId = crypto.randomUUID();
      const tokenResponse = yield* Effect.gen(function* () {
        explicitAuthenticationInProgress = true;
        setConnectionState({
          status: "connecting",
          lastError: null,
          connectedAccount: null,
        });
        const connection = yield* replaceConnection(userRef.host);
        setConnectionState({
          status: "authenticating",
          lastError: null,
          connectedAccount: null,
        });

        yield* requireCapabilities(
          connection,
          userRef.host,
          signup ? ["auth.signup", "auth.token"] : ["auth.token"]
        );
        if (signup) {
          yield* connection.request({
            type: "auth_signup",
            data: { name: userRef.name, password },
          });
        }
        const reply = yield* connection.request({
          type: "auth_token_password",
          data: {
            username: userRef.name,
            password,
            client_id: clientId,
            scope: "openid",
          },
        });
        explicitAuthenticationInProgress = false;
        setAuthenticatedStatus(userRef);
        return reply.data;
      }).pipe(
        // Return to the saved account's session
        Effect.onError((cause) =>
          Effect.gen(function* () {
            explicitAuthenticationInProgress = false;
            teardownConnection();
            setConnectionState({
              status: "disconnected",
              lastError: failureMessage(cause, fallbackError),
              connectedAccount: null,
            });
            yield* triggerSync;
          })
        )
      );
      // Outside the attempt, so the connection stays signed in if saving
      // fails, as before.
      yield* saveSession(() =>
        persistAuthenticatedAccount(userRef, tokenResponse, clientId)
      );
    }, showAuthError(fallbackError));
  }

  const cancelPendingAuthentication = Effect.gen(function* () {
    if (!explicitAuthenticationInProgress) return;
    cancelHostTransport();
    if (current) yield* current.connection.disconnect;
  });

  const reconnectActiveSession = Effect.gen(function* () {
    const { activeAccount, activeAuth } = getAuthSnapshot();
    if (!activeAccount || !activeAuth || explicitAuthenticationInProgress) {
      return;
    }

    teardownConnection();
    setConnectionState({ status: "reconnecting", connectedAccount: null });
    yield* triggerSync;
  });

  yield* followStoredAuth;

  let lastActiveSessionKey = getActiveSessionKey();
  yield* triggerSync;

  yield* Effect.acquireRelease(
    Effect.sync(() => {
      function handleVisibilityChange() {
        if (document.visibilityState === "hidden") {
          hiddenAt = Date.now();
          return;
        }
        if (
          hiddenAt !== null &&
          (Date.now() - hiddenAt >= RESUME_RECONNECT_AFTER_MS ||
            getState(connectionAtom).incompatibleHost !== null)
        ) {
          run(reconnectActiveSession);
        }
        hiddenAt = null;
      }
      function handlePageShow(event: PageTransitionEvent) {
        // Restored from the back/forward cache with a dead socket.
        if (event.persisted) run(reconnectActiveSession);
      }
      function handleOnline() {
        run(reconnectActiveSession);
      }
      document.addEventListener("visibilitychange", handleVisibilityChange);
      window.addEventListener("pageshow", handlePageShow);
      window.addEventListener("online", handleOnline);
      return () => {
        document.removeEventListener(
          "visibilitychange",
          handleVisibilityChange
        );
        window.removeEventListener("pageshow", handlePageShow);
        window.removeEventListener("online", handleOnline);
      };
    }),
    (removeListeners) => Effect.sync(removeListeners)
  );

  yield* Effect.acquireRelease(
    Effect.sync(() =>
      appAtomRegistry.subscribe(authAtom, () => {
        const nextSessionKey = getActiveSessionKey();
        if (nextSessionKey === lastActiveSessionKey) {
          return;
        }

        lastActiveSessionKey = nextSessionKey;
        authRetryAttempt = 0;
        run(triggerSync);
      })
    ),
    (unsubscribe) => Effect.sync(unsubscribe)
  );

  yield* Effect.addFinalizer(() => Effect.sync(teardownConnection));

  return RunelinkSession.of({
    request: sendRequest,
    login: passwordAuth(false),
    signup: passwordAuth(true),
    cancelPendingAuthentication,
  });
});

export const layer = Layer.effect(RunelinkSession, make);
