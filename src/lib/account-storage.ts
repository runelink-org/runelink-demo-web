import {
  UserRefSchema,
  normalizeHostInput,
  stripDefaultPort,
  validateHost,
  validateUsername,
  type UserRef,
} from "@runelink/sdk";
import { z } from "zod";

const APP_CONFIG_STORAGE_KEY = "runelink.demo.app-config";
export const AUTH_CACHE_STORAGE_KEY = "runelink.demo.auth-cache";

export const StoredAccountAuthSchema = z.object({
  refresh_token: z.string(),
  access_token: z.string().optional(),
  expires_at: z.number().int().optional(),
  client_id: z.string().optional(),
  scope: z.string().optional(),
});

export const BrowserAppConfigSchema = z.object({
  active_account: UserRefSchema.nullable().default(null),
  accounts: z.array(UserRefSchema).default([]),
});

// Configs saved before the rename store the active account as
// `default_account`. Remove once stored configs have been migrated.
const StoredAppConfigSchema = BrowserAppConfigSchema.extend({
  default_account: UserRefSchema.nullable().optional(),
});

export const BrowserAuthCacheSchema = z.object({
  accounts: z.record(z.string(), StoredAccountAuthSchema).default({}),
});

export type StoredAccountAuth = z.infer<typeof StoredAccountAuthSchema>;
export type BrowserAppConfig = z.infer<typeof BrowserAppConfigSchema>;
export type BrowserAuthCache = z.infer<typeof BrowserAuthCacheSchema>;

function canUseStorage(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function loadStoredJson<T>(key: string, schema: z.ZodType<T>, fallback: T): T {
  if (!canUseStorage()) {
    return fallback;
  }

  const rawValue = window.localStorage.getItem(key);
  if (!rawValue) {
    return fallback;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as unknown;
    const result = schema.safeParse(parsedValue);

    return result.success ? result.data : fallback;
  } catch {
    return fallback;
  }
}

function saveStoredJson<T>(key: string, value: T): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

// Hosts identify default-port users without the port, so saved accounts do
// too. Otherwise lookups, deletions, and updates would not match them.
export function normalizeHost(host: string): string {
  return stripDefaultPort(validateHost(host));
}

function canonicalUserRef(userRef: UserRef): UserRef {
  return { ...userRef, host: stripDefaultPort(userRef.host) };
}

export function normalizeAccountInput(input: {
  name: string;
  host: string;
}): UserRef {
  return UserRefSchema.parse({
    name: validateUsername(input.name),
    host: normalizeHost(input.host),
  });
}

export function normalizeHostDraft(host: string): string {
  return normalizeHostInput(host);
}

export function accountStorageKey(userRef: UserRef): string {
  return `${userRef.name}@${userRef.host}`;
}

export function sameUserRef(
  left: UserRef | null,
  right: UserRef | null
): boolean {
  if (!left || !right) {
    return left === right;
  }

  return left.name === right.name && left.host === right.host;
}

export function hasAccount(accounts: UserRef[], userRef: UserRef): boolean {
  return accounts.some((account) => sameUserRef(account, userRef));
}

export function upsertAccount(
  accounts: UserRef[],
  userRef: UserRef
): UserRef[] {
  return hasAccount(accounts, userRef) ? accounts : [...accounts, userRef];
}

export function loadBrowserAppConfig(): BrowserAppConfig {
  const config = loadStoredJson(
    APP_CONFIG_STORAGE_KEY,
    StoredAppConfigSchema,
    StoredAppConfigSchema.parse({})
  );
  const activeAccount = config.active_account ?? config.default_account;
  const migrated: BrowserAppConfig = {
    active_account: activeAccount ? canonicalUserRef(activeAccount) : null,
    // Accounts saved before hosts were canonical may include the default
    // port, so merge accounts that only differed by it.
    accounts: config.accounts.map(canonicalUserRef).reduce(upsertAccount, []),
  };
  if (config.default_account !== undefined) {
    try {
      saveBrowserAppConfig(migrated);
    } catch {
      // Use the migrated config in memory and retry on the next load
    }
  }
  return migrated;
}

export function saveBrowserAppConfig(config: BrowserAppConfig): void {
  saveStoredJson(APP_CONFIG_STORAGE_KEY, config);
}

export function loadBrowserAuthCache(): BrowserAuthCache {
  const cache = loadStoredJson(
    AUTH_CACHE_STORAGE_KEY,
    BrowserAuthCacheSchema,
    BrowserAuthCacheSchema.parse({})
  );
  // An entry saved under the canonical key is newer than one with the
  // default port, so it wins when both exist.
  const accounts: BrowserAuthCache["accounts"] = {};
  for (const [key, auth] of Object.entries(cache.accounts)) {
    const canonicalKey = stripDefaultPort(key);
    if (key === canonicalKey || !(canonicalKey in cache.accounts)) {
      accounts[canonicalKey] = auth;
    }
  }
  return { accounts };
}

export function saveBrowserAuthCache(cache: BrowserAuthCache): void {
  saveStoredJson(AUTH_CACHE_STORAGE_KEY, cache);
}
