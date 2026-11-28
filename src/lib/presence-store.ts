import type {
  ChosenPresenceStatus,
  PresenceStatus,
  UserPresenceStatus,
  UserRef,
} from "@runelink/sdk";
import * as Effect from "effect/Effect";
import { sameUserRef } from "@/lib/account-storage";
import {
  appAtomRegistry,
  getState,
  setState,
  stateAtom,
} from "@/lib/atom-registry";
import { authAtom, getActiveAccount } from "@/lib/auth-store";
import { omitRecordKey } from "@/lib/record";
import { connectionAtom, request } from "@/lib/runelink-session";
import {
  bindStoreToActiveAccount,
  userRefKey,
} from "@/lib/runelink-store-utils";

/** What the app shows for a user, including the connected account's own
 * chosen status. */
export type DisplayedPresenceStatus = PresenceStatus | ChosenPresenceStatus;

type PresenceState = {
  // Users missing here are offline.
  statusByUserRefKey: Partial<Record<string, PresenceStatus>>;
  // The connected account's status, once its host sends it
  chosenStatus: ChosenPresenceStatus | null;
};

const initialState: PresenceState = {
  statusByUserRefKey: {},
  chosenStatus: null,
};

export const presenceAtom = stateAtom(initialState);

export function applyPresenceStatus({
  user_ref,
  status,
}: UserPresenceStatus): void {
  const key = userRefKey(user_ref);
  // Statuses often arrive again through each server's host.
  const known = getState(presenceAtom).statusByUserRefKey[key] ?? "offline";
  if (known === status) return;
  setState(presenceAtom, (state) => ({
    statusByUserRefKey:
      status === "offline"
        ? omitRecordKey(state.statusByUserRefKey, key)
        : { ...state.statusByUserRefKey, [key]: status },
  }));
}

export function applyChosenPresenceStatus(status: ChosenPresenceStatus): void {
  setState(presenceAtom, { chosenStatus: status });
}

/** What to show for a user: the connected account sees its chosen status. */
export function selectPresenceStatus(
  state: PresenceState,
  userRef: UserRef,
  connectedAccount: UserRef | null
): DisplayedPresenceStatus {
  if (sameUserRef(connectedAccount, userRef)) {
    return state.chosenStatus ?? "offline";
  }
  return state.statusByUserRefKey[userRefKey(userRef)] ?? "offline";
}

// Not applied optimistically: the host sends the new status to each of the
// account's connections, including this one, in the order they were chosen.
export const updateChosenPresenceStatus = Effect.fn(
  "Presence.updateChosenPresenceStatus"
)(function* (status: ChosenPresenceStatus) {
  yield* request({ type: "presence_status_update", data: { status } });
});

function reset(): void {
  setState(presenceAtom, initialState);
}

// Statuses belong to the socket rather than the account. Hosts send a socket
// every status it should know as soon as it authenticates, which can be before
// the reply, so statuses from an earlier socket are dropped before
// authenticating again. Only a change of status drops them, since other writes
// to the connection can come while it is still authenticating.
let previousConnectionStatus = getState(connectionAtom).status;
appAtomRegistry.subscribe(connectionAtom, ({ status }) => {
  if (status !== previousConnectionStatus && status !== "connected") {
    reset();
  }
  previousConnectionStatus = status;
});

// A login saves its account only after the socket authenticated, which keeps
// the statuses its host already sent. Switching to another account drops them
// while the old socket is still open.
bindStoreToActiveAccount(() => {
  const { connectedAccount } = getState(connectionAtom);
  if (
    !sameUserRef(connectedAccount, authAtom.pipe(getState, getActiveAccount))
  ) {
    reset();
  }
});
