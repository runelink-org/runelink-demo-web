import {
  RunelinkConnection,
  TokenResponseSchema,
  type TokenResponse,
  type UserRef,
  type WsReply,
  type WsRequest,
} from "@runelink/sdk";
import { create } from "zustand";
import { sameUserRef, type StoredAccountAuth } from "@/lib/account-storage";
import {
  getAuthSessionSnapshot,
  registerAuthSessionActionsBridge,
  storeAuthSessionToken,
  subscribeToAuthSession,
} from "@/lib/auth-session-bridge";
import { handleRunelinkUpdate } from "@/lib/runelink-updates";

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
  disconnect: () => void;
  request: (message: WsRequest) => Promise<WsReply>;
};

let currentConnection: RunelinkConnection | null = null;
let currentConnectionHost: string | null = null;
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

function getTransportSecurityMode(): "secure-only" | "prefer-secure" {
  return window.location.protocol === "https:"
    ? "secure-only"
    : "prefer-secure";
}

export const useRunelinkConnectionStore = create<RunelinkConnectionStore>(
  (set) => ({
    initialized: false,
    status: "disconnected",
    lastError: null,
    connectedAccount: null,
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
  useRunelinkConnectionStore.setState({
    status: "connected",
    lastError: null,
    connectedAccount: userRef,
  });
}

function teardownConnection(): void {
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

  const connection = new RunelinkConnection(host, {
    autoReconnect: true,
    transportSecurity: getTransportSecurityMode(),
  });

  currentConnection = connection;
  currentConnectionHost = host;
  attachConnectionListeners(connection);

  try {
    await connection.connect();
    replaceInProgress = false;
  } catch (error) {
    replaceInProgress = false;
    if (connection === currentConnection) {
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
  const reply = await connection.send({
    type: "auth_token_access",
    data: {
      access_token: accessToken,
    },
  });

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
  const reply = await connection.send({
    type: "auth_token_refresh",
    data: {
      refresh_token: auth.refresh_token,
      client_id: auth.client_id ?? null,
      scope: auth.scope ?? null,
    },
  });

  if (reply.type !== "auth_token") {
    throw new Error(`Unexpected reply type: ${reply.type}`);
  }

  const tokenResponse = TokenResponseSchema.parse(reply.data);
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
    const nowInSeconds = Math.floor(Date.now() / 1000);
    if (
      auth.access_token &&
      (!auth.expires_at || auth.expires_at > nowInSeconds + 60)
    ) {
      await authenticateWithAccessToken(connection, userRef, auth.access_token);
    } else {
      await authenticateWithRefreshToken(connection, userRef, auth);
    }

    if (generation !== syncGeneration || connection !== currentConnection) {
      return;
    }

    setAuthenticatedStatus(userRef);
  } catch (error) {
    if (generation !== syncGeneration || connection !== currentConnection) {
      return;
    }

    connection.disconnect();
    useRunelinkConnectionStore.setState({
      status: "disconnected",
      lastError:
        error instanceof Error
          ? error.message
          : "Unable to authenticate websocket",
      connectedAccount: null,
    });
  }
}

function scheduleSyncConnectionToActiveAccount(): Promise<void> {
  if (syncInFlight) {
    syncQueued = true;
    return syncInFlight;
  }

  const syncPromise = syncConnectionToActiveAccount().finally(() => {
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
  const connection = await waitForAuthenticatedConnection();
  if (connection !== currentConnection) {
    throw new Error("RuneLink connection changed before request could be sent");
  }
  return connection.send(message);
}

export async function loginWithConnection(
  userRef: UserRef,
  password: string,
  clientId: string
): Promise<TokenResponse> {
  useRunelinkConnectionStore.setState({
    status: "connecting",
    lastError: null,
    connectedAccount: null,
  });

  const connection = await ensureSocketForHost(userRef.host, {
    forceReplace: true,
  });

  useRunelinkConnectionStore.setState({
    status: "authenticating",
    lastError: null,
    connectedAccount: null,
  });

  try {
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
    setAuthenticatedStatus(userRef);
    return tokenResponse;
  } catch (error) {
    teardownConnection();
    useRunelinkConnectionStore.setState({
      status: "disconnected",
      lastError: error instanceof Error ? error.message : "Unable to log in",
      connectedAccount: null,
    });
    throw error instanceof Error ? error : new Error(String(error));
  }
}

export async function signupAndLoginWithConnection(
  userRef: UserRef,
  password: string
): Promise<{ tokenResponse: TokenResponse; clientId: string }> {
  useRunelinkConnectionStore.setState({
    status: "connecting",
    lastError: null,
    connectedAccount: null,
  });

  const connection = await ensureSocketForHost(userRef.host, {
    forceReplace: true,
  });

  useRunelinkConnectionStore.setState({
    status: "authenticating",
    lastError: null,
    connectedAccount: null,
  });

  try {
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
    setAuthenticatedStatus(userRef);
    return { tokenResponse, clientId };
  } catch (error) {
    teardownConnection();
    useRunelinkConnectionStore.setState({
      status: "disconnected",
      lastError:
        error instanceof Error ? error.message : "Unable to create account",
      connectedAccount: null,
    });
    throw error instanceof Error ? error : new Error(String(error));
  }
}

export async function refreshConnectionAuth(
  userRef: UserRef,
  auth: StoredAccountAuth
): Promise<string> {
  const forceReplace =
    currentConnectionHost !== userRef.host || !connectionMatches(userRef);
  const connection = await ensureSocketForHost(userRef.host, {
    forceReplace,
  });

  useRunelinkConnectionStore.setState({
    status: "authenticating",
    lastError: null,
    connectedAccount: null,
  });

  try {
    const accessToken = await authenticateWithRefreshToken(
      connection,
      userRef,
      auth
    );
    setAuthenticatedStatus(userRef);
    return accessToken;
  } catch (error) {
    teardownConnection();
    useRunelinkConnectionStore.setState({
      status: "disconnected",
      lastError:
        error instanceof Error ? error.message : "Unable to refresh session",
      connectedAccount: null,
    });
    throw error instanceof Error ? error : new Error(String(error));
  }
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

  const connection = await ensureSocketForHost(activeAccount.host, {
    forceReplace: shouldReplaceConnection,
  });
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
  subscribeToAuthSession(() => {
    const nextSessionKey = getActiveSessionKey();
    if (nextSessionKey === lastActiveSessionKey) {
      return;
    }

    lastActiveSessionKey = nextSessionKey;
    void scheduleSyncConnectionToActiveAccount();
  });
}

registerAuthSessionActionsBridge({
  loginWithConnection,
  signupAndLoginWithConnection,
  refreshConnectionAuth,
});
