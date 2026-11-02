import {
  CLIENT_WS_SUPPORTED_CAPABILITIES,
  getApiUrl,
  type UserRef,
} from "@runelink/sdk";
import { accountStorageKey, sameUserRef } from "@/lib/account-storage";
import {
  getActiveAccount,
  getActiveAccountAuth,
  isSavedAccount,
  useAuthStore,
} from "@/lib/auth-store";
import { getKnownHostTransport } from "@/lib/host-transport";

const LOOKUP_TIMEOUT_MS = 10_000;
const NOT_FOUND_ERROR = "Resource not found";
// HTTP requests use the same capability versions as websocket requests.
const USERS_READ = `users.read@${CLIENT_WS_SUPPORTED_CAPABILITIES["users.read"][0]}`;
// Saved accounts are checked after startup so the check never delays loading.
const SAVED_ACCOUNT_CHECK_DELAY_MS = 3_000;

let savedAccountCheckScheduled = false;
// Set by the app, so the stores that use this module never import UI code.
let notifyAccountDeleted: (account: string) => void = () => {};

export function forgetDeletedAccount(userRef: UserRef): void {
  if (useAuthStore.getState().removeAccount(userRef, { selectNext: false })) {
    notifyAccountDeleted(accountStorageKey(userRef));
  }
}

// Hosts relay deletions reported by their peers without verifying them, so a
// deletion update only triggers a check with the user's home host.
export function handleUserDeletedUpdate(userRef: UserRef): void {
  if (isSavedAccount(userRef)) {
    void checkAccountDeleted(userRef);
  }
}

// Asks the home host whether a user still exists, without credentials. Only a
// definite "not found" from the host counts as deleted; unreachable hosts,
// timeouts, and other errors do not.
async function isDeletedOnHomeHost(userRef: UserRef): Promise<boolean> {
  // Only HTTPS is tried for hosts this browser has not connected to, since
  // unencrypted connections need the user's approval.
  const secure = getKnownHostTransport(userRef.host) ?? true;
  const apiUrl = getApiUrl(userRef.host, secure);
  const path = `/users/${encodeURIComponent(userRef.host)}/${encodeURIComponent(userRef.name)}`;
  try {
    const response = await fetch(`${apiUrl}${path}`, {
      headers: { "runelink-capability": USERS_READ },
      credentials: "omit",
      redirect: "manual",
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    if (response.status !== 404) {
      return false;
    }
    // Make sure the 404 is the host's "not found" error, not a proxy's.
    const body = (await response.json()) as { error?: unknown } | null;
    return body?.error === NOT_FOUND_ERROR;
  } catch {
    return false;
  }
}

export async function checkAccountDeleted(userRef: UserRef): Promise<void> {
  if (await isDeletedOnHomeHost(userRef)) {
    forgetDeletedAccount(userRef);
  }
}

// Starts reporting deleted accounts, and checks saved accounts that the active
// connection does not already verify.
export function initializeAccountDeletion(
  notify: (account: string) => void
): void {
  notifyAccountDeleted = notify;
  if (savedAccountCheckScheduled) return;
  savedAccountCheckScheduled = true;
  setTimeout(() => {
    const state = useAuthStore.getState();
    const verifiedAccount = getActiveAccountAuth(state)
      ? getActiveAccount(state)
      : null;
    for (const account of state.config.accounts) {
      if (!sameUserRef(account, verifiedAccount)) {
        void checkAccountDeleted(account);
      }
    }
  }, SAVED_ACCOUNT_CHECK_DELAY_MS);
}
