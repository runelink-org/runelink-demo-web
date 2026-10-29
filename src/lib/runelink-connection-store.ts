import {
  RunelinkConnection,
  RunelinkIncompatibleHostError,
  RunelinkRequestError,
  TokenResponseSchema,
  getWsUrl,
  type TokenResponse,
  type UserRef,
  type WsReply,
  type WsRequest,
} from "@runelink/sdk";
import { create } from "zustand";
import { sameUserRef, type StoredAccountAuth } from "@/lib/account-storage";
import {
  clearAuthSessionAccount,
  getAuthSessionSnapshot,
  registerAuthSessionActionsBridge,
  storeAuthSessionToken,
  subscribeToAuthSession,
} from "@/lib/auth-session-bridge";
import { handleRunelinkUpdate } from "@/lib/runelink-updates";
import {
  HostUnreachableError,
  resolveHostTransport,
} from "@/lib/host-transport";

export type AccountConnectionStatus =
  | "disconnected"
  | "connecting"
  | "reconnecting"
  | "unauthenticated"
  | "authenticating"
  | "connected";

type RunelinkConnectionStore = {
  initialized: boolean;
  status: AccountConnectionStatus;
  lastError: string | null;
  connectedAccount: UserRef | null;
  // Capabilities this client offered that the host did not agree to.
  unsupportedCapabilities: string[];
  incompatibleHost: string | null;
  disconnect: () => void;
  request: (message: WsRequest) => Promise<WsReply>;
};

let currentConnection: RunelinkConnection | null = null;
let currentConnectionHost: string | null = null;
let transportResolution: AbortController | null = null;
let currentStatusCleanup: (() => void) | null = null;
let currentErrorCleanup: (() => void) | null = null;
let currentUpdateCleanup: (() => void) | null = null;
let currentConnectionAuthenticated = false;
let lifecycleInitialized = false;
let syncGeneration = 0;
let syncInFlight: Promise<void> | null = null;
let syncQueued = false;
let replaceInProgress = false;
let lastActiveSessionKey: string | null = null;
let explicitAuthenticationInProgress = false;
let authRetryTimer: ReturnType<typeof setTimeout> | null = null;
let authRetryAttempt = 0;
let hiddenAt: number | null = null;

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

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

function isAuthRejection(error: unknown): boolean {
  return (
    error instanceof RunelinkRequestError &&
    AUTH_REJECTION_ERROR_CODES.has(error.code)
  );
}

// Whether `auth` is still the active session. Syncs can outlive a logout or
// account switch (e.g. while waiting out a host outage), and must not restore
// the old session when they resume.
function isActiveSession(userRef: UserRef, auth: StoredAccountAuth): boolean {
  const { activeAccount, activeAuth } = getAuthSessionSnapshot();
  return (
    sameUserRef(activeAccount, userRef) &&
    activeAuth?.refresh_token === auth.refresh_token
  );
}

// Fails before anything is sent, e.g. so signup cannot create an account that
// cannot then log in.
function requireCapabilities(
  connection: RunelinkConnection,
  host: string,
  capabilities: string[]
): void {
  const unsupported = connection.getUnsupportedCapabilities() ?? [];
  const missing = capabilities.filter((id) => unsupported.includes(id));
  if (missing.length > 0) {
    throw new RunelinkIncompatibleHostError(
      host,
      `missing ${missing.join(", ")}`
    );
  }
}

function clearAuthRetryTimer(): void {
  if (authRetryTimer === null) return;
  clearTimeout(authRetryTimer);
  authRetryTimer = null;
}

export const useRunelinkConnectionStore = create<RunelinkConnectionStore>(
  (set) => ({
    initialized: false,
    status: "disconnected",
    lastError: null,
    connectedAccount: null,
    unsupportedCapabilities: [],
    incompatibleHost: null,
    disconnect() {
      teardownConnection();
      set({
        status: "disconnected",
        lastError: null,
        connectedAccount: null,
      });
    },
    request(message) {
      return requestRunelink(message);
    },
  })
);

function getConnectedAccount(): UserRef | null {
  return useRunelinkConnectionStore.getState().connectedAccount;
}

function setUnauthenticatedStatus(status: AccountConnectionStatus): void {
  currentConnectionAuthenticated = false;
  useRunelinkConnectionStore.setState({
    status,
    connectedAccount: null,
  });
}

function setAuthenticatedStatus(userRef: UserRef): void {
  currentConnectionAuthenticated = true;
  authRetryAttempt = 0;
  useRunelinkConnectionStore.setState({
    status: "connected",
    lastError: null,
    connectedAccount: userRef,
  });
}

function teardownConnection(): void {
  transportResolution?.abort();
  transportResolution = null;
  clearAuthRetryTimer();
  currentStatusCleanup?.();
  currentErrorCleanup?.();
  currentUpdateCleanup?.();
  currentStatusCleanup = null;
  currentErrorCleanup = null;
  currentUpdateCleanup = null;
  if (currentConnection) {
    currentConnection.disconnect();
    currentConnection = null;
  }
  currentConnectionHost = null;
  currentConnectionAuthenticated = false;
  replaceInProgress = false;
  useRunelinkConnectionStore.setState({
    unsupportedCapabilities: [],
    incompatibleHost: null,
  });
}

function connectionMatches(userRef: UserRef): boolean {
  return sameUserRef(getConnectedAccount(), userRef);
}

function getActiveSessionKey(): string | null {
  const authState = getAuthSessionSnapshot();
  const activeAccount = authState.activeAccount;
  if (!activeAccount) {
    return null;
  }

  const activeAuth = authState.activeAuth;
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

async function waitForStatus(
  predicate: (
    status: AccountConnectionStatus,
    account: UserRef | null
  ) => boolean
): Promise<RunelinkConnection> {
  const state = useRunelinkConnectionStore.getState();
  if (currentConnection && predicate(state.status, state.connectedAccount)) {
    return currentConnection;
  }
  if (state.status === "disconnected") {
    throw new Error(state.lastError ?? "RuneLink connection is not available");
  }

  return new Promise((resolve, reject) => {
    const unsubscribe = useRunelinkConnectionStore.subscribe((storeState) => {
      if (
        currentConnection &&
        predicate(storeState.status, storeState.connectedAccount)
      ) {
        unsubscribe();
        resolve(currentConnection);
        return;
      }

      if (storeState.status === "disconnected") {
        unsubscribe();
        reject(
          new Error(
            storeState.lastError ?? "RuneLink connection is not available"
          )
        );
      }
    });
  });
}

function attachConnectionListeners(connection: RunelinkConnection): void {
  currentStatusCleanup = connection.subscribeStatus((status) => {
    if (connection !== currentConnection) {
      return;
    }

    if (status === "connected") {
      useRunelinkConnectionStore.setState({
        unsupportedCapabilities: connection.getUnsupportedCapabilities() ?? [],
      });
      if (currentConnectionAuthenticated) {
        const connectedAccount = getConnectedAccount();
        if (connectedAccount) {
          useRunelinkConnectionStore.setState({
            status: "connected",
            lastError: null,
            connectedAccount,
          });
        }
        return;
      }

      setUnauthenticatedStatus("unauthenticated");
      if (!replaceInProgress) {
        void scheduleSyncConnectionToActiveAccount();
      }
      return;
    }

    setUnauthenticatedStatus(status);
  });

  currentErrorCleanup = connection.onError((error) => {
    if (connection !== currentConnection) {
      return;
    }

    useRunelinkConnectionStore.setState({
      lastError: error.message,
      ...(error instanceof RunelinkIncompatibleHostError
        ? { incompatibleHost: error.message }
        : {}),
    });
  });

  currentUpdateCleanup = connection.onUpdate((update) => {
    if (connection !== currentConnection) {
      return;
    }

    handleRunelinkUpdate(update);
  });
}

async function replaceConnection(host: string): Promise<RunelinkConnection> {
  teardownConnection();
  replaceInProgress = true;

  const resolution = new AbortController();
  transportResolution = resolution;
  let secure: boolean;
  try {
    secure = await resolveHostTransport(host, resolution.signal);
  } catch (error) {
    if (transportResolution === resolution) {
      replaceInProgress = false;
      useRunelinkConnectionStore.setState({
        status: "disconnected",
        lastError: error instanceof Error ? error.message : "Unable to connect",
        connectedAccount: null,
      });
    }
    throw error;
  }
  resolution.signal.throwIfAborted();
  transportResolution = null;

  // Explicit URL mode prevents the SDK from silently falling back to ws://.
  // Browser WebSockets reject redirects during their handshake.
  const connection = new RunelinkConnection(
    getWsUrl(host, secure),
    {
      autoReconnect: true,
      transportSecurity: "secure-only",
    },
    "url"
  );

  currentConnection = connection;
  currentConnectionHost = host;
  // Start connecting before subscribing so listeners never see the new
  // connection's initial "disconnected" status, which would reject waiters.
  const connectPromise = connection.connect();
  attachConnectionListeners(connection);

  try {
    await connectPromise;
    if (connection === currentConnection) {
      replaceInProgress = false;
    }
  } catch (error) {
    if (connection === currentConnection) {
      replaceInProgress = false;
      useRunelinkConnectionStore.setState({
        status: "disconnected",
        lastError: error instanceof Error ? error.message : "Unable to connect",
        connectedAccount: null,
      });
    }
    throw error instanceof Error ? error : new Error(String(error));
  }

  return connection;
}

async function ensureSocketForHost(
  host: string,
  options: { forceReplace?: boolean } = {}
): Promise<RunelinkConnection> {
  const forceReplace = options.forceReplace ?? false;
  const state = useRunelinkConnectionStore.getState();

  if (
    !forceReplace &&
    currentConnection &&
    currentConnectionHost === host &&
    (state.status === "connected" || state.status === "unauthenticated")
  ) {
    return currentConnection;
  }

  return replaceConnection(host);
}

async function authenticateWithAccessToken(
  connection: RunelinkConnection,
  userRef: UserRef,
  accessToken: string
): Promise<void> {
  const reply = await withTimeout(
    connection.send({
      type: "auth_token_access",
      data: {
        access_token: accessToken,
      },
    }),
    AUTH_REQUEST_TIMEOUT_MS,
    "Timed out authenticating websocket"
  );

  if (
    reply.type !== "auth_token_access" ||
    reply.data.type !== "authenticated" ||
    !sameUserRef(reply.data.data.user_ref, userRef)
  ) {
    throw new Error("Websocket authentication returned an unexpected account");
  }
}

async function authenticateWithRefreshToken(
  connection: RunelinkConnection,
  userRef: UserRef,
  auth: StoredAccountAuth
): Promise<string> {
  const clientId = auth.client_id ?? crypto.randomUUID();
  const reply = await withTimeout(
    connection.send({
      type: "auth_token_refresh",
      data: {
        refresh_token: auth.refresh_token,
        client_id: auth.client_id ?? null,
        scope: auth.scope ?? null,
      },
    }),
    AUTH_REQUEST_TIMEOUT_MS,
    "Timed out refreshing session"
  );

  if (reply.type !== "auth_token") {
    throw new Error(`Unexpected reply type: ${reply.type}`);
  }

  const tokenResponse = TokenResponseSchema.parse(reply.data);
  if (!isActiveSession(userRef, auth)) {
    throw new Error("Session changed while refreshing");
  }
  storeAuthSessionToken(userRef, tokenResponse, clientId);
  return tokenResponse.access_token;
}

async function authenticateStoredAccount(
  connection: RunelinkConnection,
  userRef: UserRef,
  auth: StoredAccountAuth,
  generation: number
): Promise<void> {
  useRunelinkConnectionStore.setState({
    status: "authenticating",
    lastError: null,
    connectedAccount: null,
  });

  try {
    // Refresh-token sign-in is the fallback for every stored session.
    requireCapabilities(connection, userRef.host, ["auth.token"]);
    const nowInSeconds = Math.floor(Date.now() / 1000);
    if (
      auth.access_token &&
      (!auth.expires_at || auth.expires_at > nowInSeconds + 60)
    ) {
      try {
        await authenticateWithAccessToken(
          connection,
          userRef,
          auth.access_token
        );
      } catch (error) {
        // Sending on a replaced connection would reopen it, and an
        // incompatible host would fail the refresh the same way.
        if (
          connection !== currentConnection ||
          error instanceof RunelinkIncompatibleHostError
        ) {
          throw error;
        }
        await authenticateWithRefreshToken(connection, userRef, auth);
      }
    } else {
      await authenticateWithRefreshToken(connection, userRef, auth);
    }

    if (
      generation !== syncGeneration ||
      connection !== currentConnection ||
      !isActiveSession(userRef, auth)
    ) {
      return;
    }

    setAuthenticatedStatus(userRef);
  } catch (error) {
    if (
      generation !== syncGeneration ||
      connection !== currentConnection ||
      !isActiveSession(userRef, auth)
    ) {
      return;
    }

    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unable to authenticate websocket";

    if (error instanceof RunelinkIncompatibleHostError) {
      // Retrying cannot help until the host is updated, so keep the stored
      // session and wait for the next explicit sync.
      useRunelinkConnectionStore.setState({
        status: "disconnected",
        lastError: errorMessage,
        connectedAccount: null,
        incompatibleHost: errorMessage,
      });
      connection.disconnect();
      return;
    }

    if (!isAuthRejection(error)) {
      // Keep the stored refresh token and try again on a fresh socket. This
      // covers dropped or half-open sockets, timeouts, and host restarts.
      scheduleAuthRetry(errorMessage);
      return;
    }

    clearAuthSessionAccount(userRef, errorMessage);
    connection.disconnect();
    useRunelinkConnectionStore.setState({
      status: "disconnected",
      lastError: errorMessage,
      connectedAccount: null,
    });
  }
}

function scheduleAuthRetry(errorMessage: string): void {
  teardownConnection();
  useRunelinkConnectionStore.setState({
    status: "reconnecting",
    lastError: errorMessage,
    connectedAccount: null,
  });

  authRetryAttempt += 1;
  const delayMs = Math.min(
    AUTH_RETRY_INITIAL_DELAY_MS * 2 ** (authRetryAttempt - 1),
    AUTH_RETRY_MAX_DELAY_MS
  );
  authRetryTimer = setTimeout(() => {
    authRetryTimer = null;
    void scheduleSyncConnectionToActiveAccount();
  }, delayMs);
}

function reconnectActiveSession(): void {
  const { activeAccount, activeAuth } = getAuthSessionSnapshot();
  if (!activeAccount || !activeAuth || explicitAuthenticationInProgress) {
    return;
  }

  teardownConnection();
  useRunelinkConnectionStore.setState({
    status: "reconnecting",
    connectedAccount: null,
  });
  void scheduleSyncConnectionToActiveAccount();
}

function initializeResumeReconnect(): void {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      return;
    }
    if (
      hiddenAt !== null &&
      (Date.now() - hiddenAt >= RESUME_RECONNECT_AFTER_MS ||
        useRunelinkConnectionStore.getState().incompatibleHost !== null)
    ) {
      reconnectActiveSession();
    }
    hiddenAt = null;
  });
  window.addEventListener("pageshow", (event) => {
    // Restored from the back/forward cache with a dead socket.
    if (event.persisted) reconnectActiveSession();
  });
  window.addEventListener("online", reconnectActiveSession);
}

function scheduleSyncConnectionToActiveAccount(): Promise<void> {
  if (syncInFlight) {
    syncQueued = true;
    return syncInFlight;
  }

  // Failures are reflected in the store status, so waiters fall back to
  // waitForStatus instead of receiving a stale connection error.
  const syncPromise = syncConnectionToActiveAccount()
    .catch(() => undefined)
    .finally(() => {
      if (syncInFlight !== syncPromise) {
        return;
      }

      syncInFlight = null;
      if (syncQueued) {
        syncQueued = false;
        void scheduleSyncConnectionToActiveAccount();
      }
    });

  syncInFlight = syncPromise;
  return syncPromise;
}

async function waitForAuthenticatedConnection(): Promise<RunelinkConnection> {
  const authState = getAuthSessionSnapshot();
  const activeAccount = authState.activeAccount;

  if (activeAccount && connectionMatches(activeAccount) && currentConnection) {
    return currentConnection;
  }

  await scheduleSyncConnectionToActiveAccount();

  const nextActiveAccount = getAuthSessionSnapshot().activeAccount;
  if (
    nextActiveAccount &&
    connectionMatches(nextActiveAccount) &&
    currentConnection
  ) {
    return currentConnection;
  }

  return waitForStatus(
    (status, account) =>
      status === "connected" &&
      !!nextActiveAccount &&
      sameUserRef(account, nextActiveAccount)
  );
}

export async function requestRunelink(message: WsRequest): Promise<WsReply> {
  const generation = syncGeneration;
  const connection = await waitForAuthenticatedConnection();
  if (generation !== syncGeneration || connection !== currentConnection) {
    throw new Error("RuneLink connection changed before request could be sent");
  }
  return connection.send(message);
}

export async function loginWithConnection(
  userRef: UserRef,
  password: string,
  clientId: string
): Promise<TokenResponse> {
  explicitAuthenticationInProgress = true;
  useRunelinkConnectionStore.setState({
    status: "connecting",
    lastError: null,
    connectedAccount: null,
  });

  try {
    const connection = await ensureSocketForHost(userRef.host, {
      forceReplace: true,
    });

    useRunelinkConnectionStore.setState({
      status: "authenticating",
      lastError: null,
      connectedAccount: null,
    });

    requireCapabilities(connection, userRef.host, ["auth.token"]);
    const reply = await connection.send({
      type: "auth_token_password",
      data: {
        username: userRef.name,
        password,
        client_id: clientId,
        scope: "openid",
      },
    });

    if (reply.type !== "auth_token") {
      throw new Error(`Unexpected reply type: ${reply.type}`);
    }

    const tokenResponse = TokenResponseSchema.parse(reply.data);
    explicitAuthenticationInProgress = false;
    setAuthenticatedStatus(userRef);
    return tokenResponse;
  } catch (error) {
    explicitAuthenticationInProgress = false;
    teardownConnection();
    useRunelinkConnectionStore.setState({
      status: "disconnected",
      lastError: error instanceof Error ? error.message : "Unable to log in",
      connectedAccount: null,
    });
    void scheduleSyncConnectionToActiveAccount();
    throw error instanceof Error ? error : new Error(String(error));
  }
}

export async function signupAndLoginWithConnection(
  userRef: UserRef,
  password: string
): Promise<{ tokenResponse: TokenResponse; clientId: string }> {
  explicitAuthenticationInProgress = true;
  useRunelinkConnectionStore.setState({
    status: "connecting",
    lastError: null,
    connectedAccount: null,
  });

  try {
    const connection = await ensureSocketForHost(userRef.host, {
      forceReplace: true,
    });

    useRunelinkConnectionStore.setState({
      status: "authenticating",
      lastError: null,
      connectedAccount: null,
    });

    requireCapabilities(connection, userRef.host, [
      "auth.signup",
      "auth.token",
    ]);
    const signupReply = await connection.send({
      type: "auth_signup",
      data: {
        name: userRef.name,
        password,
      },
    });

    if (signupReply.type !== "auth_signup") {
      throw new Error(`Unexpected reply type: ${signupReply.type}`);
    }

    const clientId = crypto.randomUUID();
    const loginReply = await connection.send({
      type: "auth_token_password",
      data: {
        username: userRef.name,
        password,
        client_id: clientId,
        scope: "openid",
      },
    });

    if (loginReply.type !== "auth_token") {
      throw new Error(`Unexpected reply type: ${loginReply.type}`);
    }

    const tokenResponse = TokenResponseSchema.parse(loginReply.data);
    explicitAuthenticationInProgress = false;
    setAuthenticatedStatus(userRef);
    return { tokenResponse, clientId };
  } catch (error) {
    explicitAuthenticationInProgress = false;
    teardownConnection();
    useRunelinkConnectionStore.setState({
      status: "disconnected",
      lastError:
        error instanceof Error ? error.message : "Unable to create account",
      connectedAccount: null,
    });
    void scheduleSyncConnectionToActiveAccount();
    throw error instanceof Error ? error : new Error(String(error));
  }
}

export function cancelPendingAuthentication(): void {
  if (!explicitAuthenticationInProgress) {
    return;
  }
  transportResolution?.abort();
  currentConnection?.disconnect();
}

async function syncConnectionToActiveAccount(): Promise<void> {
  const generation = ++syncGeneration;
  const authState = getAuthSessionSnapshot();
  const activeAccount = authState.activeAccount;
  const activeAuth = authState.activeAuth;

  useRunelinkConnectionStore.setState({ initialized: true });

  if (!activeAccount || !activeAuth) {
    teardownConnection();
    useRunelinkConnectionStore.setState({
      status: "disconnected",
      lastError: authState.authError,
      connectedAccount: null,
    });
    return;
  }

  const shouldReplaceConnection =
    !currentConnection ||
    currentConnectionHost !== activeAccount.host ||
    (currentConnectionAuthenticated && !connectionMatches(activeAccount));

  let connection: RunelinkConnection;
  try {
    connection = await ensureSocketForHost(activeAccount.host, {
      forceReplace: shouldReplaceConnection,
    });
  } catch (error) {
    if (
      error instanceof HostUnreachableError &&
      generation === syncGeneration &&
      isActiveSession(activeAccount, activeAuth) &&
      !explicitAuthenticationInProgress
    ) {
      scheduleAuthRetry(error.message);
    }
    return;
  }
  if (generation !== syncGeneration || connection !== currentConnection) {
    return;
  }

  if (connectionMatches(activeAccount) && currentConnectionAuthenticated) {
    if (useRunelinkConnectionStore.getState().status !== "connected") {
      setAuthenticatedStatus(activeAccount);
    }
    return;
  }

  await authenticateStoredAccount(
    connection,
    activeAccount,
    activeAuth,
    generation
  );
}

export function initializeRunelinkConnectionStore(): void {
  if (lifecycleInitialized) return;
  lifecycleInitialized = true;
  lastActiveSessionKey = getActiveSessionKey();
  void scheduleSyncConnectionToActiveAccount();
  initializeResumeReconnect();
  subscribeToAuthSession(() => {
    const nextSessionKey = getActiveSessionKey();
    if (nextSessionKey === lastActiveSessionKey) {
      return;
    }

    lastActiveSessionKey = nextSessionKey;
    authRetryAttempt = 0;
    void scheduleSyncConnectionToActiveAccount();
  });
}

registerAuthSessionActionsBridge({
  loginWithConnection,
  signupAndLoginWithConnection,
});
