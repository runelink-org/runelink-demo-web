import { UserRefSchema, type UserRef } from "@runelink/sdk";
import { z } from "zod";

const APP_CONFIG_STORAGE_KEY = "runelink.demo.app-config";
const AUTH_CACHE_STORAGE_KEY = "runelink.demo.auth-cache";

export const StoredAccountAuthSchema = z.object({
  refresh_token: z.string(),
  access_token: z.string().optional(),
  expires_at: z.number().int().optional(),
  client_id: z.string().optional(),
  scope: z.string().optional(),
});

export const BrowserAppConfigSchema = z.object({
  default_account: UserRefSchema.nullable().default(null),
  accounts: z.array(UserRefSchema).default([]),
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

export function normalizeHost(host: string): string {
  return host
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
}

export function normalizeAccountInput(input: {
  name: string;
  host: string;
}): UserRef {
  return UserRefSchema.parse({
    name: input.name.trim(),
    host: normalizeHost(input.host),
  });
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

export function loadBrowserAppConfig(): BrowserAppConfig {
  return loadStoredJson(
    APP_CONFIG_STORAGE_KEY,
    BrowserAppConfigSchema,
    BrowserAppConfigSchema.parse({})
  );
}

export function saveBrowserAppConfig(config: BrowserAppConfig): void {
  saveStoredJson(APP_CONFIG_STORAGE_KEY, config);
}

export function loadBrowserAuthCache(): BrowserAuthCache {
  return loadStoredJson(
    AUTH_CACHE_STORAGE_KEY,
    BrowserAuthCacheSchema,
    BrowserAuthCacheSchema.parse({})
  );
}

export function saveBrowserAuthCache(cache: BrowserAuthCache): void {
  saveStoredJson(AUTH_CACHE_STORAGE_KEY, cache);
}
