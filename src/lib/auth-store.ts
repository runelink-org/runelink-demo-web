import { create } from "zustand";
import { type TokenResponse, type UserRef } from "@runelink/sdk";
import {
  loginAuthSessionWithConnection,
  registerAuthSessionStateBridge,
  signupAuthSessionWithConnection,
} from "@/lib/auth-session-bridge";
import {
  AUTH_CACHE_STORAGE_KEY,
  accountStorageKey,
  hasAccount,
  loadBrowserAppConfig,
  loadBrowserAuthCache,
  normalizeAccountInput,
  sameUserRef,
  saveBrowserAppConfig,
  saveBrowserAuthCache,
  upsertAccount,
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
  // Returns false if the account was not saved.
  removeAccount: (
    userRef: UserRef,
    options?: { selectNext?: boolean }
  ) => boolean;
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

// Starts from the stored tokens, which other tabs may have replaced since this
// tab last heard about it. Clearing tokens does the same.
function storeLatestToken(
  userRef: UserRef,
  tokenResponse: TokenResponse,
  clientId: string
): BrowserAuthCache {
  const authCache = loadBrowserAuthCache();
  const previousAuth = authCache.accounts[accountStorageKey(userRef)];
  return storeTokenState(
    authCache,
    userRef,
    buildStoredAuth(previousAuth, tokenResponse, clientId)
  );
}

function persistAuthenticatedAccount(
  state: AuthStore,
  userRef: UserRef,
  tokenResponse: TokenResponse,
  clientId: string
): Pick<AuthStore, "config" | "authCache" | "authError"> {
  const nextConfig = {
    active_account: userRef,
    accounts: upsertAccount(state.config.accounts, userRef),
  };
  const nextAuthCache = storeLatestToken(userRef, tokenResponse, clientId);

  persistState(nextConfig, nextAuthCache);

  return {
    config: nextConfig,
    authCache: nextAuthCache,
    authError: null,
  };
}

export function isSavedAccount(userRef: UserRef): boolean {
  return hasAccount(useAuthStore.getState().config.accounts, userRef);
}

export function getActiveAccount(state: AuthStore): UserRef | null {
  return state.config.active_account;
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
        active_account: normalizedAccount,
        accounts: upsertAccount(state.config.accounts, normalizedAccount),
      };

      saveBrowserAppConfig(nextConfig);

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
    const activeAccount = get().config.active_account;
    if (!activeAccount) return;
    get().clearAccountAuth(activeAccount);
  },

  removeAccount(userRef, { selectNext = true } = {}) {
    const state = get();
    const accounts = state.config.accounts.filter(
      (account) => !sameUserRef(account, userRef)
    );
    if (accounts.length === state.config.accounts.length) {
      return false;
    }

    const nextConfig = {
      active_account: sameUserRef(state.config.active_account, userRef)
        ? selectNext
          ? (accounts[0] ?? null)
          : null
        : state.config.active_account,
      accounts,
    };
    const nextAuthCache = clearTokenState(loadBrowserAuthCache(), userRef);

    persistState(nextConfig, nextAuthCache);
    set({ config: nextConfig, authCache: nextAuthCache, authError: null });
    return true;
  },

  storeAccountToken(userRef, tokenResponse, clientId) {
    const normalizedAccount = normalizeAccountInput(userRef);
    // Refreshes only replace tokens, so the account config is left alone.
    const nextAuthCache = storeLatestToken(
      normalizedAccount,
      tokenResponse,
      clientId
    );
    saveBrowserAuthCache(nextAuthCache);
    set({ authCache: nextAuthCache, authError: null });
  },

  clearAccountAuth(userRef, errorMessage) {
    const normalizedAccount = normalizeAccountInput(userRef);
    const nextAuthCache = clearTokenState(
      loadBrowserAuthCache(),
      normalizedAccount
    );
    saveBrowserAuthCache(nextAuthCache);
    set({ authCache: nextAuthCache, authError: errorMessage ?? null });
  },
}));

let storedAuthFollowed = false;

function syncStoredAuth(): void {
  useAuthStore.setState({ authCache: loadBrowserAuthCache() });
}

// Tabs share the stored tokens, and a refresh in one tab replaces the refresh
// token, so other tabs follow the stored tokens instead of keeping a replaced
// one. Storage events only fire in the tabs that did not make the change.
export function followStoredAuth(): void {
  if (storedAuthFollowed) return;
  storedAuthFollowed = true;
  window.addEventListener("storage", (event) => {
    if (event.key === AUTH_CACHE_STORAGE_KEY || event.key === null) {
      syncStoredAuth();
    }
  });
  // Catch up on changes made since the cache was first loaded.
  syncStoredAuth();
}

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
  clearAccountAuth(userRef, errorMessage) {
    useAuthStore.getState().clearAccountAuth(userRef, errorMessage);
  },
});
