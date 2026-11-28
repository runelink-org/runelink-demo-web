import { textChannelRefOf } from "@runelink/sdk";
import type {
  ResourceId,
  ResourceRef,
  ServerChannel,
  ServerChannelId,
  ServerChannelRef,
  ServerRef,
  TextChannelRef,
  UserRef,
} from "@runelink/sdk";
import { accountStorageKey, sameUserRef } from "@/lib/account-storage";
import { appAtomRegistry, getState } from "@/lib/atom-registry";
import {
  authAtom,
  getActiveAccount,
  getActiveAccountAuth,
} from "@/lib/auth-store";

export type TargetHost = string | null;

export type TextServerChannel = Extract<ServerChannel, { kind: "text" }>;

export function userRefKey(userRef: UserRef): string {
  return accountStorageKey(userRef);
}

// Channels are on the host of their server
export function channelRefOf(
  serverRef: ServerRef,
  channelId: ServerChannelId
): ServerChannelRef {
  return { host: serverRef.host, id: channelId };
}

export function sameResource<Id extends ResourceId>(
  a: ResourceRef<Id> | null,
  b: ResourceRef<Id> | null
): boolean {
  if (a == null || b == null) return a === b;
  return a.host === b.host && a.id === b.id;
}

/** The text channel a channel owns, if it is a text channel. */
export function ownedTextChannelRefOf(
  channel: ServerChannel
): TextChannelRef | null {
  return channel.kind === "text" ? textChannelRefOf(channel) : null;
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
