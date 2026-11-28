import { omitRecordKey, omitRecordKeys } from "./record";
import { captureChannelNavigationUpdate } from "@/lib/channel-navigation-hints";
import { compareResourceVersions } from "./resource-version";
import { mergeMessages } from "./message-cache";
import { channelServerRef, resourceKey, textChannelRef } from "@runelink/sdk";
import type {
  FullServerMembership,
  Message,
  ResourceKey,
  ResourceRef,
  Server,
  ServerChannel,
  User,
  UserRef,
  WsUpdate,
} from "@runelink/sdk";
import { getState, setState } from "@/lib/atom-registry";
import { isDeletingAccount } from "@/lib/account-deletion";
import { channelsAtom } from "@/lib/channel-state";
import { authAtom, getActiveAccount } from "@/lib/auth-store";
import {
  applyChannelUpserts,
  removeChannelFromCaches,
} from "@/lib/channels-store";
import {
  removeMember,
  removeMembership,
  toServerMember,
  toServerMembership,
  upsertMember,
  upsertMembership,
} from "@/lib/membership-utils";
import { isDeletingMembership, membershipsAtom } from "@/lib/memberships-store";
import { closeMessageEdit } from "@/lib/message-composer-store";
import { isDeletingMessage, messagesAtom } from "@/lib/messages-store";
import { navigationAtom } from "@/lib/navigation-store";
import {
  channelRef,
  sameResource,
  userRefKey,
  ownedTextChannelRef,
} from "@/lib/runelink-store-utils";
import { debugRunelink } from "@/lib/runelink-debug";
import { serversAtom } from "@/lib/servers-store";
import { usersAtom } from "@/lib/users-store";

// Set by the app, so the stores that use this module never import UI code.
let notify: ((message: string) => void) | undefined;

export function setUpdateNotifier(
  notifier: ((message: string) => void) | undefined
): void {
  notify = notifier;
}

function isLoadedServer(server: ResourceRef): boolean {
  const state = getState(serversAtom);
  const key = resourceKey(server);
  return key in state.serverByKey || key in state.serverWithChannelsByKey;
}

function getKnownTextChannelKeysForServer(
  serverKey: ResourceKey
): ResourceKey[] {
  return [
    ...new Set(
      [
        ...(getState(channelsAtom).channelsByServerKey[serverKey] ?? []),
        ...(getState(serversAtom).serverWithChannelsByKey[serverKey]
          ?.channels ?? []),
      ].flatMap((channel) => {
        const textChannel = ownedTextChannelRef(channel);
        return textChannel ? [resourceKey(textChannel)] : [];
      })
    ),
  ];
}

function removeMessageState(deletedTextChannelKeys: ResourceKey[]): void {
  setState(messagesAtom, (state) => ({
    hasFetchedByTextChannelKey: omitRecordKeys(
      state.hasFetchedByTextChannelKey,
      deletedTextChannelKeys
    ),
    messagesByTextChannelKey: omitRecordKeys(
      state.messagesByTextChannelKey,
      deletedTextChannelKeys
    ),
    isLoadingByTextChannelKey: omitRecordKeys(
      state.isLoadingByTextChannelKey,
      deletedTextChannelKeys
    ),
    errorByTextChannelKey: omitRecordKeys(
      state.errorByTextChannelKey,
      deletedTextChannelKeys
    ),
  }));
}

function removeLoadedServerState(server: ResourceRef): void {
  const serverKey = resourceKey(server);
  const deletedTextChannelKeys = getKnownTextChannelKeysForServer(serverKey);

  setState(membershipsAtom, (state) => ({
    membershipsByUserRefKey: Object.fromEntries(
      Object.entries(state.membershipsByUserRefKey).map(
        ([userKey, memberships]) => [
          userKey,
          removeMembership(memberships, server),
        ]
      )
    ),
    membersByServerKey: omitRecordKey(state.membersByServerKey, serverKey),
    hasFetchedMembersByServerKey: omitRecordKey(
      state.hasFetchedMembersByServerKey,
      serverKey
    ),
  }));
  removeMessageState(deletedTextChannelKeys);
  setState(channelsAtom, (state) => ({
    channelsByServerKey: omitRecordKey(state.channelsByServerKey, serverKey),
    channelByKey: omitRecordKeys(
      state.channelByKey,
      (state.channelsByServerKey[serverKey] ?? []).map(resourceKey)
    ),
  }));
  setState(navigationAtom, (state) => ({
    selectedServer: sameResource(state.selectedServer, server)
      ? null
      : state.selectedServer,
    selectedChannelIdByServerKey: omitRecordKey(
      state.selectedChannelIdByServerKey,
      serverKey
    ),
  }));
  setState(serversAtom, (state) => ({
    serverByKey: omitRecordKey(state.serverByKey, serverKey),
    serverWithChannelsByKey: omitRecordKey(
      state.serverWithChannelsByKey,
      serverKey
    ),
  }));
}

function handleUserUpsert(user: User): void {
  const key = userRefKey(user);
  if (!(key in getState(usersAtom).userByRefKey)) {
    return;
  }

  setState(usersAtom, (state) => ({
    userByRefKey: { ...state.userByRefKey, [key]: user },
  }));
}

function handleUserDeleted(userRef: UserRef): void {
  const userKey = userRefKey(userRef);
  if (!(userKey in getState(usersAtom).userByRefKey)) {
    return;
  }

  setState(usersAtom, (state) => ({
    userByRefKey: omitRecordKey(state.userByRefKey, userKey),
  }));
}

function handleMembershipUpsert(membership: FullServerMembership): void {
  const state = getState(membershipsAtom);
  const userKey = userRefKey(membership.user);
  const serverKey = resourceKey(membership.server);
  if (
    !(userKey in state.membershipsByUserRefKey) &&
    !(serverKey in state.membersByServerKey)
  ) {
    debugRunelink("skip membership_upserted", {
      server: serverKey,
      user: membership.user,
    });
    return;
  }

  debugRunelink("apply membership_upserted", {
    server: serverKey,
    user: membership.user,
  });

  setState(membershipsAtom, (currentState) => ({
    ...(userKey in currentState.membershipsByUserRefKey && {
      membershipsByUserRefKey: {
        ...currentState.membershipsByUserRefKey,
        [userKey]: upsertMembership(
          currentState.membershipsByUserRefKey[userKey] ?? [],
          toServerMembership(membership)
        ),
      },
    }),
    ...(serverKey in currentState.membersByServerKey && {
      membersByServerKey: {
        ...currentState.membersByServerKey,
        [serverKey]: upsertMember(
          currentState.membersByServerKey[serverKey] ?? [],
          toServerMember(membership)
        ),
      },
    }),
  }));
}

function handleMembershipDeleted(server: ResourceRef, userRef: UserRef): void {
  const state = getState(membershipsAtom);
  const activeAccount = authAtom.pipe(getState, getActiveAccount);
  const userKey = userRefKey(userRef);
  const serverKey = resourceKey(server);
  const membership = (state.membershipsByUserRefKey[userKey] ?? []).find(
    (innerMembership) => resourceKey(innerMembership.server) === serverKey
  );
  const hasMembers = serverKey in state.membersByServerKey;

  if (!membership && !hasMembers) {
    debugRunelink("skip membership_deleted", { server: serverKey, userRef });
    return;
  }

  if (activeAccount !== null && userRefKey(activeAccount) === userKey) {
    debugRunelink("remove server state for active account membership_deleted", {
      server: serverKey,
      userRef,
    });
    // The server cache follows renames, unlike the membership
    const title = getState(serversAtom).serverByKey[serverKey]?.title;
    removeLoadedServerState(server);
    if (
      membership &&
      !isDeletingMembership(server, userRef) &&
      !isDeletingAccount(userRef)
    ) {
      notify?.(
        `You're no longer a member of ${title ?? membership.server.title}.`
      );
    }
    return;
  }

  debugRunelink("apply membership_deleted", { server: serverKey, userRef });

  setState(membershipsAtom, (currentState) => ({
    ...(membership && {
      membershipsByUserRefKey: {
        ...currentState.membershipsByUserRefKey,
        [userKey]: removeMembership(
          currentState.membershipsByUserRefKey[userKey] ?? [],
          server
        ),
      },
    }),
    ...(hasMembers && {
      membersByServerKey: {
        ...currentState.membersByServerKey,
        [serverKey]: removeMember(
          currentState.membersByServerKey[serverKey] ?? [],
          userRef
        ),
      },
    }),
  }));
}

function handleServerUpsert(server: Server): void {
  const { serverByKey, serverWithChannelsByKey } = getState(serversAtom);
  const key = resourceKey(server);
  const previous = serverByKey[key] ?? serverWithChannelsByKey[key]?.server;
  if (previous != null && compareResourceVersions(previous, server) > 0) return;
  if (!isLoadedServer(server)) {
    return;
  }

  setState(serversAtom, (state) => {
    const withChannels = state.serverWithChannelsByKey[key];
    return {
      serverByKey: { ...state.serverByKey, [key]: server },
      ...(withChannels != null && {
        serverWithChannelsByKey: {
          ...state.serverWithChannelsByKey,
          [key]: { ...withChannels, server },
        },
      }),
    };
  });
}

function handleChannelUpsert(channel: ServerChannel): void {
  const server = channelServerRef(channel);
  if (!isLoadedServer(server)) {
    return;
  }

  applyChannelUpserts(server, [channel]);
}

function handleChannelDeleted(server: ResourceRef, channelId: string): void {
  if (!isLoadedServer(server)) {
    return;
  }

  const serverKey = resourceKey(server);
  const channel =
    getState(channelsAtom).channelByKey[
      resourceKey(channelRef(server, channelId))
    ] ??
    getState(serversAtom).serverWithChannelsByKey[serverKey]?.channels.find(
      (matchedChannel) => matchedChannel.id === channelId
    );
  const textChannel = channel && ownedTextChannelRef(channel);
  if (textChannel) {
    removeMessageState([resourceKey(textChannel)]);
  }
  removeChannelFromCaches(server, channelId);
  setState(navigationAtom, (state) => ({
    selectedChannelIdByServerKey: {
      ...state.selectedChannelIdByServerKey,
      [serverKey]:
        state.selectedChannelIdByServerKey[serverKey] === channelId
          ? null
          : (state.selectedChannelIdByServerKey[serverKey] ?? null),
    },
  }));
}

function handleMessageUpsert(message: Message): void {
  captureChannelNavigationUpdate(message);
  const textChannelKey = resourceKey(textChannelRef(message));
  if (!(textChannelKey in getState(messagesAtom).messagesByTextChannelKey)) {
    return;
  }

  setState(messagesAtom, (state) => ({
    messagesByTextChannelKey: {
      ...state.messagesByTextChannelKey,
      [textChannelKey]: mergeMessages(
        state.messagesByTextChannelKey[textChannelKey] ?? [],
        [message]
      ),
    },
  }));
  if (
    message.deleted_at !== null &&
    closeMessageEdit(message) &&
    !isDeletingMessage(message)
  ) {
    notify?.("The message you were editing was deleted.");
  }
}

// Applies an update to the data this client has loaded. Replies to this
// client's own edits are applied the same way.
export function handleRunelinkUpdate(update: WsUpdate): void {
  debugRunelink("ws update", update);
  switch (update.type) {
    case "user_upserted": {
      handleUserUpsert(update.data);
      break;
    }
    case "user_deleted": {
      handleUserDeleted(update.data.user_ref);
      break;
    }
    case "membership_upserted": {
      handleMembershipUpsert(update.data);
      break;
    }
    case "membership_deleted": {
      handleMembershipDeleted(update.data.server, update.data.user_ref);
      break;
    }
    case "server_upserted": {
      handleServerUpsert(update.data);
      break;
    }
    case "server_deleted": {
      if (isLoadedServer(update.data.server)) {
        removeLoadedServerState(update.data.server);
      }
      break;
    }
    case "channel_upserted": {
      handleChannelUpsert(update.data);
      break;
    }
    case "channel_deleted": {
      handleChannelDeleted(update.data.server, update.data.channel_id);
      break;
    }
    case "message_upserted": {
      handleMessageUpsert(update.data);
      break;
    }
  }
}
