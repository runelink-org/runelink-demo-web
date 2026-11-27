import { CLIENT_WS_SUPPORTED_CAPABILITIES, getApiUrl } from "@runelink/sdk";
import type { UserRef } from "@runelink/sdk";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { accountStorageKey, sameUserRef } from "@/lib/account-storage";
import { getState } from "@/lib/atom-registry";
import {
  authAtom,
  getActiveAccount,
  getActiveAccountAuth,
  removeAccount,
} from "@/lib/auth-store";
import { getKnownHostTransport } from "@/lib/host-transport";

class AccountLookupError extends Schema.TaggedError<AccountLookupError>()(
  "AccountLookupError",
  {}
) {}

const LOOKUP_TIMEOUT_MS = 10_000;
const NOT_FOUND_ERROR = "Resource not found";
// HTTP requests use the same capability versions as websocket requests.
const USERS_READ = `users.read@${CLIENT_WS_SUPPORTED_CAPABILITIES["users.read"][0]}`;
const decodeErrorBody = Schema.decodeUnknownOption(
  Schema.Struct({ error: Schema.Unknown })
);

// Set by the app, so the stores that use this module never import UI code.
let notifyAccountDeleted: ((account: string) => void) | undefined;

export function setAccountDeletedNotifier(
  notify: (account: string) => void
): void {
  notifyAccountDeleted = notify;
}

// Accounts this client is deleting. The host removes their memberships first,
// which must not read as being removed from each server.
const deletingAccounts = new Set<string>();

export function isDeletingAccount(userRef: UserRef): boolean {
  return deletingAccounts.has(accountStorageKey(userRef));
}

export function trackAccountDeletion<A, E, R>(
  userRef: UserRef,
  deletion: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> {
  const key = accountStorageKey(userRef);
  return Effect.suspend(() => {
    deletingAccounts.add(key);
    return deletion;
  }).pipe(Effect.ensuring(Effect.sync(() => deletingAccounts.delete(key))));
}

export function forgetDeletedAccount(userRef: UserRef): void {
  if (removeAccount(userRef, { selectNext: false })) {
    notifyAccountDeleted?.(accountStorageKey(userRef));
  }
}

// Asks the home host whether a user still exists, without credentials. Only a
// definite "not found" from the host counts as deleted; unreachable hosts,
// timeouts, and other errors do not.
const isDeletedOnHomeHost = Effect.fn("AccountDeletion.isDeletedOnHomeHost")(
  function* (userRef: UserRef) {
    // Only HTTPS is tried for hosts this browser has not connected to, since
    // unencrypted connections need the user's approval.
    const secure = getKnownHostTransport(userRef.host) ?? true;
    const apiUrl = getApiUrl(userRef.host, secure);
    const path = `/users/${encodeURIComponent(userRef.host)}/${encodeURIComponent(userRef.name)}`;
    const data = yield* Effect.tryPromise({
      try: (signal): Promise<unknown> =>
        // Keep native fetch and its abort signal active through the body read.
        // @effect-diagnostics-next-line globalFetchInEffect:off
        fetch(`${apiUrl}${path}`, {
          headers: { "runelink-capability": USERS_READ },
          credentials: "omit",
          redirect: "manual",
          signal,
        }).then((response) =>
          response.status === 404 ? response.json() : undefined
        ),
      catch: () => new AccountLookupError(),
    }).pipe(
      Effect.timeout(LOOKUP_TIMEOUT_MS),
      Effect.orElseSucceed(() => undefined)
    );
    // Make sure the 404 is the host's "not found" error, not a proxy's.
    const body = decodeErrorBody(data);
    return Option.isSome(body) && body.value.error === NOT_FOUND_ERROR;
  }
);

export const checkAccountDeleted = Effect.fn("AccountDeletion.check")(
  function* (userRef: UserRef) {
    if (yield* isDeletedOnHomeHost(userRef)) {
      forgetDeletedAccount(userRef);
    }
  }
);

// Checks saved accounts that the active connection does not already verify.
export const checkSavedAccounts = Effect.gen(function* () {
  const state = getState(authAtom);
  const verifiedAccount = getActiveAccountAuth(state)
    ? getActiveAccount(state)
    : null;
  yield* Effect.forEach(
    state.config.accounts.filter(
      (account) => !sameUserRef(account, verifiedAccount)
    ),
    // One failed check must not stop the others.
    (account) =>
      checkAccountDeleted(account).pipe(
        Effect.catchDefect((defect) =>
          Effect.logError("Account deletion check failed", defect)
        )
      ),
    { concurrency: "unbounded", discard: true }
  );
});
