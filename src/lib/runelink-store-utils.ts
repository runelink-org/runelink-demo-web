import type { UserRef } from "@runelink/sdk";
import { accountStorageKey, sameUserRef } from "@/lib/account-storage";
import { appAtomRegistry, getState } from "@/lib/atom-registry";
import {
  authAtom,
  getActiveAccount,
  getActiveAccountAuth,
} from "@/lib/auth-store";

export type TargetHost = string | null;
export type ServerId = string;
export type ChannelId = string;
export type TextChannelId = string;
export type MessageId = string;

export function userRefKey(userRef: UserRef): string {
  return accountStorageKey(userRef);
}

export function serverChannelKey(
  serverId: ServerId,
  channelId: ChannelId
): string {
  return `${serverId}:${channelId}`;
}

export function bindStoreToActiveAccount(reset: () => void): () => void {
  let previousAccount = authAtom.pipe(getState, getActiveAccount);
  let previousHasAuth = Boolean(authAtom.pipe(getState, getActiveAccountAuth));

  return appAtomRegistry.subscribe(authAtom, (state) => {
    const nextAccount = getActiveAccount(state);
    const nextHasAuth = Boolean(getActiveAccountAuth(state));
    const accountChanged =
      previousAccount == null
        ? nextAccount != null
        : nextAccount == null || !sameUserRef(previousAccount, nextAccount);
    const authChanged = previousHasAuth !== nextHasAuth;

    previousAccount = nextAccount;
    previousHasAuth = nextHasAuth;

    if (accountChanged || authChanged) {
      reset();
    }
  });
}
