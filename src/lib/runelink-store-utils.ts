import { textChannelRef } from "@runelink/sdk";
import type {
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
export function channelRef(
  server: ServerRef,
  channelId: ServerChannelId
): ServerChannelRef {
  return { host: server.host, id: channelId };
}

export function sameResource<Id extends string>(
  a: ResourceRef<Id> | null,
  b: ResourceRef<Id> | null
): boolean {
  if (a == null || b == null) return a === b;
  return a.host === b.host && a.id === b.id;
}

/** The text channel a channel owns, if it is a text channel. */
export function ownedTextChannelRef(
  channel: ServerChannel
): TextChannelRef | null {
  return channel.kind === "text" ? textChannelRef(channel) : null;
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
