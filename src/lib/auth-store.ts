import { create } from "zustand";
import { type TokenResponse, type UserRef } from "@runelink/sdk";
import {
  loginAuthSessionWithConnection,
  registerAuthSessionStateBridge,
  signupAuthSessionWithConnection,
} from "@/lib/auth-session-bridge";
import {
  accountStorageKey,
  loadBrowserAppConfig,
  loadBrowserAuthCache,
  normalizeAccountInput,
  sameUserRef,
  saveBrowserAppConfig,
  saveBrowserAuthCache,
  type BrowserAppConfig,
  type BrowserAuthCache,
  type StoredAccountAuth,
} from "@/lib/account-storage";

type AccountCredentials = {
  host: string;
  name: string;
  password: string;
};

type AuthResult = {
  success: boolean;
  error?: string;
};

type AuthStore = {
  config: BrowserAppConfig;
  authCache: BrowserAuthCache;
  authError: string | null;
  selectAccount: (userRef: UserRef) => void;
  openAccount: (userRef: UserRef) => void;
  clearAuthError: () => void;
  signup: (credentials: AccountCredentials) => Promise<AuthResult>;
  login: (credentials: AccountCredentials) => Promise<AuthResult>;
  logoutActive: () => void;
  storeAccountToken: (
    userRef: UserRef,
    tokenResponse: TokenResponse,
    clientId: string
  ) => void;
  clearAccountAuth: (userRef: UserRef, errorMessage?: string) => void;
};

const initialConfig = loadBrowserAppConfig();
const initialAuthCache = loadBrowserAuthCache();

function persistState(
  config: BrowserAppConfig,
  authCache: BrowserAuthCache
): void {
  saveBrowserAppConfig(config);
  saveBrowserAuthCache(authCache);
}

function upsertAccount(accounts: UserRef[], userRef: UserRef): UserRef[] {
  if (accounts.some((account) => sameUserRef(account, userRef))) {
    return accounts;
  }

  return [...accounts, userRef];
}

function storeTokenState(
  authCache: BrowserAuthCache,
  userRef: UserRef,
  auth: StoredAccountAuth
): BrowserAuthCache {
  return {
    accounts: {
      ...authCache.accounts,
      [accountStorageKey(userRef)]: auth,
    },
  };
}

function clearTokenState(
  authCache: BrowserAuthCache,
  userRef: UserRef
): BrowserAuthCache {
  const nextAccounts = { ...authCache.accounts };
  delete nextAccounts[accountStorageKey(userRef)];

  return { accounts: nextAccounts };
}

function buildStoredAuth(
  previousAuth: StoredAccountAuth | undefined,
  tokenResponse: {
    access_token: string;
    expires_in: number;
    refresh_token: string;
    scope: string;
  },
  clientId: string
): StoredAccountAuth {
  const nowInSeconds = Math.floor(Date.now() / 1000);
  return {
    refresh_token: tokenResponse.refresh_token,
    access_token: tokenResponse.access_token,
    expires_at: nowInSeconds + tokenResponse.expires_in,
    client_id: clientId,
    scope: tokenResponse.scope || previousAuth?.scope,
  };
}

function persistAuthenticatedAccount(
  state: AuthStore,
  userRef: UserRef,
  tokenResponse: TokenResponse,
  clientId: string
): Pick<AuthStore, "config" | "authCache" | "authError"> {
  const nextConfig = {
    default_account: userRef,
    accounts: upsertAccount(state.config.accounts, userRef),
  };
  const previousAuth = state.authCache.accounts[accountStorageKey(userRef)];
  const nextAuthCache = storeTokenState(
    state.authCache,
    userRef,
    buildStoredAuth(previousAuth, tokenResponse, clientId)
  );

  persistState(nextConfig, nextAuthCache);

  return {
    config: nextConfig,
    authCache: nextAuthCache,
    authError: null,
  };
}

export function getActiveAccount(state: AuthStore): UserRef | null {
  return state.config.default_account;
}

export function getActiveAccountAuth(
  state: AuthStore
): StoredAccountAuth | null {
  const activeAccount = getActiveAccount(state);
  if (!activeAccount) {
    return null;
  }
  return state.authCache.accounts[accountStorageKey(activeAccount)] ?? null;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  config: initialConfig,
  authCache: initialAuthCache,
  authError: null,

  selectAccount(userRef) {
    const normalizedAccount = normalizeAccountInput(userRef);

    set((state) => {
      const nextConfig = {
        default_account: normalizedAccount,
        accounts: upsertAccount(state.config.accounts, normalizedAccount),
      };

      persistState(nextConfig, state.authCache);

      return {
        config: nextConfig,
        authError: null,
      };
    });
  },

  openAccount(userRef) {
    get().selectAccount(userRef);
  },

  clearAuthError() {
    set({ authError: null });
  },

  async signup(credentials) {
    try {
      const normalizedAccount = normalizeAccountInput(credentials);
      const { tokenResponse, clientId } = await signupAuthSessionWithConnection(
        normalizedAccount,
        credentials.password
      );

      set((state) => ({
        ...persistAuthenticatedAccount(
          state,
          normalizedAccount,
          tokenResponse,
          clientId
        ),
      }));

      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unable to create account";
      set({ authError: errorMessage });
      return { success: false, error: errorMessage };
    }
  },

  async login(credentials) {
    try {
      const normalizedAccount = normalizeAccountInput(credentials);
      const clientId = crypto.randomUUID();
      const tokenResponse = await loginAuthSessionWithConnection(
        normalizedAccount,
        credentials.password,
        clientId
      );

      set((state) => ({
        ...persistAuthenticatedAccount(
          state,
          normalizedAccount,
          tokenResponse,
          clientId
        ),
      }));

      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unable to log in";
      set({ authError: errorMessage });
      return { success: false, error: errorMessage };
    }
  },

  logoutActive() {
    const activeAccount = get().config.default_account;
    if (!activeAccount) return;
    get().clearAccountAuth(activeAccount);
  },

  storeAccountToken(userRef, tokenResponse, clientId) {
    const normalizedAccount = normalizeAccountInput(userRef);
    set((state) => ({
      ...persistAuthenticatedAccount(
        state,
        normalizedAccount,
        tokenResponse,
        clientId
      ),
    }));
  },

  clearAccountAuth(userRef, errorMessage) {
    const normalizedAccount = normalizeAccountInput(userRef);
    set((state) => {
      const nextAuthCache = clearTokenState(state.authCache, normalizedAccount);
      persistState(state.config, nextAuthCache);

      return {
        authCache: nextAuthCache,
        authError: errorMessage ?? null,
      };
    });
  },
}));

registerAuthSessionStateBridge({
  getSnapshot() {
    const state = useAuthStore.getState();
    return {
      activeAccount: getActiveAccount(state),
      activeAuth: getActiveAccountAuth(state),
      authError: state.authError,
    };
  },
  subscribe(listener) {
    return useAuthStore.subscribe(listener);
  },
  storeAccountToken(userRef, tokenResponse, clientId) {
    useAuthStore.getState().storeAccountToken(userRef, tokenResponse, clientId);
  },
});
