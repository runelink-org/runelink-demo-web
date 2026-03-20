import { create } from "zustand";
import { type UserRef } from "@runelink/sdk";
import {
  loginWithPassword,
  refreshAccessToken,
  signupAccount,
} from "@/lib/auth-client";
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
  ensureAccessToken: (userRef: UserRef) => Promise<string>;
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
      await signupAccount({
        host: normalizedAccount.host,
        name: normalizedAccount.name,
        password: credentials.password,
      });

      return await get().login({
        host: normalizedAccount.host,
        name: normalizedAccount.name,
        password: credentials.password,
      });
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
      const tokenResponse = await loginWithPassword({
        host: normalizedAccount.host,
        username: normalizedAccount.name,
        password: credentials.password,
        clientId,
      });

      set((state) => {
        const nextConfig = {
          default_account: normalizedAccount,
          accounts: upsertAccount(state.config.accounts, normalizedAccount),
        };
        const previousAuth =
          state.authCache.accounts[accountStorageKey(normalizedAccount)];
        const nextAuthCache = storeTokenState(
          state.authCache,
          normalizedAccount,
          buildStoredAuth(previousAuth, tokenResponse, clientId)
        );

        persistState(nextConfig, nextAuthCache);

        return {
          config: nextConfig,
          authCache: nextAuthCache,
          authError: null,
        };
      });

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
    if (!activeAccount) {
      return;
    }

    get().clearAccountAuth(activeAccount);
  },
  async ensureAccessToken(userRef) {
    const normalizedAccount = normalizeAccountInput(userRef);
    const key = accountStorageKey(normalizedAccount);
    const auth = get().authCache.accounts[key];

    if (!auth) {
      throw new Error("No stored session for this account");
    }

    const nowInSeconds = Math.floor(Date.now() / 1000);
    if (
      auth.access_token &&
      auth.expires_at &&
      auth.expires_at > nowInSeconds + 60
    ) {
      return auth.access_token;
    }

    if (auth.access_token && !auth.expires_at) {
      return auth.access_token;
    }

    try {
      const tokenResponse = await refreshAccessToken({
        host: normalizedAccount.host,
        refreshToken: auth.refresh_token,
        clientId: auth.client_id,
        scope: auth.scope,
      });

      const nextClientId = auth.client_id ?? crypto.randomUUID();

      set((state) => {
        const latestAuth = state.authCache.accounts[key];
        const nextAuthCache = storeTokenState(
          state.authCache,
          normalizedAccount,
          buildStoredAuth(latestAuth, tokenResponse, nextClientId)
        );

        persistState(state.config, nextAuthCache);

        return {
          authCache: nextAuthCache,
          authError: null,
        };
      });

      return tokenResponse.access_token;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unable to refresh session";
      get().clearAccountAuth(normalizedAccount, errorMessage);
      throw new Error(errorMessage);
    }
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
