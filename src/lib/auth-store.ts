import { omitRecordKey } from "./record";
import type { TokenResponse, UserRef } from "@runelink/sdk";
import * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";
import { getState, setState, stateAtom } from "@/lib/atom-registry";
import {
  AUTH_CACHE_STORAGE_KEY,
  accountStorageKey,
  hasAccount,
  loadBrowserAppConfig,
  loadBrowserAuthCache,
  sameUserRef,
  saveBrowserAppConfig,
  saveBrowserAuthCache,
  upsertAccount,
} from "@/lib/account-storage";
import type {
  BrowserAppConfig,
  BrowserAuthCache,
  StoredAccountAuth,
} from "@/lib/account-storage";

type AuthState = {
  config: BrowserAppConfig;
  authCache: BrowserAuthCache;
  authError: string | null;
};

export const authAtom = stateAtom<AuthState>({
  config: loadBrowserAppConfig(),
  authCache: loadBrowserAuthCache(),
  authError: null,
});

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
  return {
    accounts: omitRecordKey(authCache.accounts, accountStorageKey(userRef)),
  };
}

function buildStoredAuth(
  previousAuth: StoredAccountAuth | undefined,
  tokenResponse: TokenResponse,
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

export function persistAuthenticatedAccount(
  userRef: UserRef,
  tokenResponse: TokenResponse,
  clientId: string
): void {
  const nextConfig = {
    active_account: userRef,
    accounts: upsertAccount(getState(authAtom).config.accounts, userRef),
  };
  const nextAuthCache = storeLatestToken(userRef, tokenResponse, clientId);

  persistState(nextConfig, nextAuthCache);
  setState(authAtom, {
    config: nextConfig,
    authCache: nextAuthCache,
    authError: null,
  });
}

export function isSavedAccount(userRef: UserRef): boolean {
  return hasAccount(getState(authAtom).config.accounts, userRef);
}

export function getActiveAccount(state: AuthState): UserRef | null {
  return state.config.active_account;
}

export function getActiveAccountAuth(
  state: AuthState
): StoredAccountAuth | null {
  const activeAccount = getActiveAccount(state);
  if (!activeAccount) {
    return null;
  }
  return state.authCache.accounts[accountStorageKey(activeAccount)] ?? null;
}

export function selectAccount(userRef: UserRef): void {
  setState(authAtom, (state) => {
    const nextConfig = {
      active_account: userRef,
      accounts: upsertAccount(state.config.accounts, userRef),
    };

    saveBrowserAppConfig(nextConfig);

    return {
      config: nextConfig,
      authError: null,
    };
  });
}

export function setAuthError(authError: string | null): void {
  setState(authAtom, { authError });
}

export function logoutActive(): void {
  const activeAccount = getState(authAtom).config.active_account;
  if (!activeAccount) return;
  clearAccountAuth(activeAccount);
}

// Returns false if the account was not saved.
export function removeAccount(
  userRef: UserRef,
  { selectNext = true }: { selectNext?: boolean } = {}
): boolean {
  const state = getState(authAtom);
  const accounts = state.config.accounts.filter(
    (account) => !sameUserRef(account, userRef)
  );
  if (accounts.length === state.config.accounts.length) {
    return false;
  }

  let activeAccount = state.config.active_account;
  if (sameUserRef(activeAccount, userRef)) {
    activeAccount = selectNext ? (accounts[0] ?? null) : null;
  }
  const nextConfig = { active_account: activeAccount, accounts };
  const nextAuthCache = clearTokenState(loadBrowserAuthCache(), userRef);

  persistState(nextConfig, nextAuthCache);
  setState(authAtom, {
    config: nextConfig,
    authCache: nextAuthCache,
    authError: null,
  });
  return true;
}

export function storeAccountToken(
  userRef: UserRef,
  tokenResponse: TokenResponse,
  clientId: string
): void {
  // Refreshes only replace tokens, so the account config is left alone.
  const nextAuthCache = storeLatestToken(userRef, tokenResponse, clientId);
  saveBrowserAuthCache(nextAuthCache);
  setState(authAtom, { authCache: nextAuthCache, authError: null });
}

export function clearAccountAuth(userRef: UserRef, errorMessage?: string) {
  const nextAuthCache = clearTokenState(loadBrowserAuthCache(), userRef);
  saveBrowserAuthCache(nextAuthCache);
  setState(authAtom, {
    authCache: nextAuthCache,
    authError: errorMessage ?? null,
  });
}

function syncStoredAuth(): void {
  setState(authAtom, { authCache: loadBrowserAuthCache() });
}

// Tabs share the stored tokens, and a refresh in one tab replaces the refresh
// token, so other tabs follow the stored tokens instead of keeping a replaced
// one. Storage events only fire in the tabs that did not make the change.
export const followStoredAuth: Effect.Effect<void, never, Scope.Scope> =
  Effect.acquireRelease(
    Effect.sync(() => {
      function handleStorage(event: StorageEvent) {
        if (event.key === AUTH_CACHE_STORAGE_KEY || event.key === null) {
          syncStoredAuth();
        }
      }
      window.addEventListener("storage", handleStorage);
      // Catch up on changes made since the cache was first loaded.
      syncStoredAuth();
      return handleStorage;
    }),
    (handleStorage) =>
      Effect.sync(() => {
        window.removeEventListener("storage", handleStorage);
      })
  ).pipe(Effect.asVoid);
