import {
  RunelinkConnection,
  type UserRef,
  type WsReply,
  type WsRequest,
} from "@runelink/sdk";
import { create } from "zustand";
import { accountStorageKey, sameUserRef } from "@/lib/account-storage";
import {
  getActiveAccount,
  getActiveAccountAuth,
  useAuthStore,
} from "@/lib/auth-store";
import { handleRunelinkUpdate } from "@/lib/runelink-updates";

export type AccountConnectionStatus =
  | "disconnected"
  | "connecting"
  | "reconnecting"
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
let currentConnectionKey: string | null = null;
let currentStatusCleanup: (() => void) | null = null;
let currentErrorCleanup: (() => void) | null = null;
let currentUpdateCleanup: (() => void) | null = null;
let lifecycleInitialized = false;
let syncGeneration = 0;

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

async function waitForAuthenticatedConnection(): Promise<RunelinkConnection> {
  const state = useRunelinkConnectionStore.getState();
  if (state.status === "connected" && currentConnection) {
    return currentConnection;
  }

  await syncConnectionToActiveAccount();

  const nextState = useRunelinkConnectionStore.getState();
  if (nextState.status === "connected" && currentConnection) {
    return currentConnection;
  }

  if (nextState.status === "disconnected") {
    throw new Error(
      nextState.lastError ?? "RuneLink connection is not available"
    );
  }

  return new Promise((resolve, reject) => {
    const unsubscribe = useRunelinkConnectionStore.subscribe((storeState) => {
      if (storeState.status === "connected" && currentConnection) {
        unsubscribe();
        resolve(currentConnection);
      } else if (storeState.status === "disconnected") {
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

export async function requestRunelink(message: WsRequest): Promise<WsReply> {
  const connection = await waitForAuthenticatedConnection();
  if (connection !== currentConnection) {
    throw new Error("RuneLink connection changed before request could be sent");
  }
  return connection.send(message);
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
  currentConnectionKey = null;
}

async function authenticateConnection(
  connection: RunelinkConnection,
  userRef: UserRef,
  generation: number
): Promise<void> {
  try {
    const accessToken = await useAuthStore
      .getState()
      .ensureAccessToken(userRef);
    const reply = await connection.send({
      type: "auth_token_access",
      data: {
        access_token: accessToken,
      },
    });

    if (generation !== syncGeneration || connection !== currentConnection) {
      return;
    }

    if (
      reply.type !== "auth_token_access" ||
      reply.data.type !== "authenticated" ||
      !sameUserRef(reply.data.data.user_ref, userRef)
    ) {
      throw new Error(
        "Websocket authentication returned an unexpected account"
      );
    }

    useRunelinkConnectionStore.setState({
      status: "connected",
      lastError: null,
      connectedAccount: userRef,
    });
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

async function syncConnectionToActiveAccount(): Promise<void> {
  const generation = ++syncGeneration;
  const authState = useAuthStore.getState();
  const activeAccount = getActiveAccount(authState);
  const activeAuth = getActiveAccountAuth(authState);

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

  const nextKey = accountStorageKey(activeAccount);
  if (currentConnection && currentConnectionKey === nextKey) {
    return;
  }

  teardownConnection();

  const connection = new RunelinkConnection(activeAccount.host, {
    autoReconnect: true,
  });

  currentConnection = connection;
  currentConnectionKey = nextKey;

  currentStatusCleanup = connection.subscribeStatus((status) => {
    if (connection !== currentConnection) {
      return;
    }
    if (status === "connected") {
      useRunelinkConnectionStore.setState({
        status: "authenticating",
        lastError: null,
        connectedAccount: null,
      });
      void authenticateConnection(connection, activeAccount, generation);
      return;
    }
    useRunelinkConnectionStore.setState({
      status,
      connectedAccount: null,
    });
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

  try {
    await connection.connect();
  } catch (error) {
    if (generation !== syncGeneration || connection !== currentConnection) {
      return;
    }
    useRunelinkConnectionStore.setState({
      status: "disconnected",
      lastError: error instanceof Error ? error.message : "Unable to connect",
      connectedAccount: null,
    });
  }
}

export function initializeRunelinkConnectionStore(): void {
  if (lifecycleInitialized) return;
  lifecycleInitialized = true;
  void syncConnectionToActiveAccount();
  useAuthStore.subscribe(() => {
    void syncConnectionToActiveAccount();
  });
}
