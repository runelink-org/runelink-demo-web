import {
  CLIENT_WS_SUPPORTED_CAPABILITIES,
  getApiUrl,
  type UserRef,
} from "@runelink/sdk";
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

const LOOKUP_TIMEOUT_MS = 10_000;
const NOT_FOUND_ERROR = "Resource not found";
// HTTP requests use the same capability versions as websocket requests.
const USERS_READ = `users.read@${CLIENT_WS_SUPPORTED_CAPABILITIES["users.read"][0]}`;
const decodeErrorBody = Schema.decodeUnknownOption(
  Schema.Struct({ error: Schema.Unknown })
);

// Set by the app, so the stores that use this module never import UI code.
let notifyAccountDeleted: (account: string) => void = () => {};

export function setAccountDeletedNotifier(
  notify: (account: string) => void
): void {
  notifyAccountDeleted = notify;
}

export function forgetDeletedAccount(userRef: UserRef): void {
  if (removeAccount(userRef, { selectNext: false })) {
    notifyAccountDeleted(accountStorageKey(userRef));
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
    return yield* Effect.tryPromise(async (signal) => {
      const response = await fetch(`${apiUrl}${path}`, {
        headers: { "runelink-capability": USERS_READ },
        credentials: "omit",
        redirect: "manual",
        signal,
      });
      if (response.status !== 404) {
        return false;
      }
      // Make sure the 404 is the host's "not found" error, not a proxy's.
      const body = decodeErrorBody(await response.json());
      return Option.isSome(body) && body.value.error === NOT_FOUND_ERROR;
    }).pipe(
      Effect.timeout(LOOKUP_TIMEOUT_MS),
      Effect.orElseSucceed(() => false)
    );
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
