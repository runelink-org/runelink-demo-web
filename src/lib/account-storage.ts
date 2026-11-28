import {
  HostSchema,
  UserRefSchema,
  validateHost,
  validateUsername,
} from "@runelink/sdk";
import type { Host, UserRef } from "@runelink/sdk";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

const APP_CONFIG_STORAGE_KEY = "runelink.demo.app-config";
export const AUTH_CACHE_STORAGE_KEY = "runelink.demo.auth-cache";

const StoredAccountAuthSchema = Schema.Struct({
  refresh_token: Schema.String,
  access_token: Schema.optional(Schema.String),
  expires_at: Schema.optional(Schema.Int),
  client_id: Schema.optional(Schema.String),
  scope: Schema.optional(Schema.String),
});

const BrowserAppConfigFields = {
  active_account: Schema.NullOr(UserRefSchema).pipe(
    Schema.withDecodingDefault(Effect.succeed(null))
  ),
  accounts: Schema.Array(UserRefSchema).pipe(
    Schema.withDecodingDefault(Effect.succeed([]))
  ),
};

const BrowserAppConfigSchema = Schema.Struct(BrowserAppConfigFields);

// Configs saved before the rename store the active account as
// `default_account`. Remove once stored configs have been migrated.
const StoredAppConfigSchema = Schema.Struct({
  ...BrowserAppConfigFields,
  default_account: UserRefSchema.pipe(Schema.NullOr, Schema.optional),
});

const BrowserAuthCacheSchema = Schema.Struct({
  accounts: Schema.Record(Schema.String, StoredAccountAuthSchema).pipe(
    Schema.withDecodingDefault(Effect.succeed({}))
  ),
});

export type StoredAccountAuth = typeof StoredAccountAuthSchema.Type;
export type BrowserAppConfig = typeof BrowserAppConfigSchema.Type;
export type BrowserAuthCache = typeof BrowserAuthCacheSchema.Type;

const decodeStoredAppConfig = Schema.decodeUnknownOption(
  Schema.fromJsonString(StoredAppConfigSchema)
);
const decodeBrowserAuthCache = Schema.decodeUnknownOption(
  Schema.fromJsonString(BrowserAuthCacheSchema)
);

function canUseStorage(): boolean {
  return typeof window !== "undefined" && window.localStorage !== undefined;
}

function loadStoredJson<T>(
  key: string,
  decode: (input: unknown) => Option.Option<T>,
  fallback: T
): T {
  if (!canUseStorage()) {
    return fallback;
  }

  const rawValue = window.localStorage.getItem(key);
  if (rawValue == null || rawValue === "") return fallback;

  return Option.getOrElse(decode(rawValue), () => fallback);
}

function saveStoredJson(key: string, value: unknown): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

export function normalizeAccountInput(input: {
  name: string;
  host: string;
}): UserRef {
  return {
    name: validateUsername(input.name),
    host: validateHost(input.host),
  };
}

const tryValidateHost = Option.liftThrowable(validateHost);

/** The host that a person entered, if it is one. */
export function enteredHost(input: string): Option.Option<Host> {
  return tryValidateHost(input);
}

/** A host as a person types it, without a URL scheme or trailing slashes. */
export function normalizeHostDraft(host: string): string {
  return host
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//u, "")
    .replace(/\/+$/u, "");
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

export function hasAccount(
  accounts: readonly UserRef[],
  userRef: UserRef
): boolean {
  return accounts.some((account) => sameUserRef(account, userRef));
}

export function upsertAccount(
  accounts: readonly UserRef[],
  userRef: UserRef
): readonly UserRef[] {
  return hasAccount(accounts, userRef) ? accounts : [...accounts, userRef];
}

const trySaveBrowserAppConfig = Option.liftThrowable(saveBrowserAppConfig);

export function loadBrowserAppConfig(): BrowserAppConfig {
  const config = loadStoredJson(APP_CONFIG_STORAGE_KEY, decodeStoredAppConfig, {
    active_account: null,
    accounts: [],
  });
  const activeAccount = config.active_account ?? config.default_account;
  // Accounts saved before hosts were canonical may include the default
  // port, which decoding drops, so merge accounts that only differed by it.
  let accounts: readonly UserRef[] = [];
  for (const account of config.accounts) {
    accounts = upsertAccount(accounts, account);
  }
  const migrated: BrowserAppConfig = {
    active_account: activeAccount ?? null,
    accounts,
  };
  if (config.default_account !== undefined) {
    // Use the migrated config in memory and retry on the next load if storage is blocked.
    trySaveBrowserAppConfig(migrated);
  }
  return migrated;
}

export function saveBrowserAppConfig(config: BrowserAppConfig): void {
  saveStoredJson(APP_CONFIG_STORAGE_KEY, config);
}

export function loadBrowserAuthCache(): BrowserAuthCache {
  const cache = loadStoredJson(AUTH_CACHE_STORAGE_KEY, decodeBrowserAuthCache, {
    accounts: {},
  });
  // An entry saved under the canonical key is newer than one with the
  // default port, so it wins when both exist.
  const accounts: Record<string, StoredAccountAuth> = {};
  for (const [key, auth] of Object.entries(cache.accounts)) {
    const canonicalKey = canonicalAccountKey(key);
    if (key === canonicalKey || !(canonicalKey in cache.accounts)) {
      accounts[canonicalKey] = auth;
    }
  }
  return { accounts };
}

const decodeHost = Schema.decodeUnknownOption(HostSchema);

// Keys saved before hosts were canonical may name the default port.
function canonicalAccountKey(key: string): string {
  // Names have no `@`
  const at = key.indexOf("@");
  return Option.match(decodeHost(key.slice(at + 1)), {
    onNone: () => key,
    onSome: (host) => `${key.slice(0, at)}@${host}`,
  });
}

export function saveBrowserAuthCache(cache: BrowserAuthCache): void {
  saveStoredJson(AUTH_CACHE_STORAGE_KEY, cache);
}
