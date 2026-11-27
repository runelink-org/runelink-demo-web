import { omitRecordKey, omitRecordKeys } from "./record";
import { captureChannelNavigationUpdate } from "@/lib/channel-navigation-hints";
import { compareResourceVersions } from "./resource-version";
import { mergeMessages } from "./message-cache";
import type {
  FullServerMembership,
  Message,
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
import { userRefKey } from "@/lib/runelink-store-utils";
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

function isLoadedServer(serverId: string): boolean {
  const state = getState(serversAtom);
  return (
    serverId in state.serverById || serverId in state.serverWithChannelsById
  );
}

function getKnownTextChannelIdsForServer(serverId: string): string[] {
  return [
    ...new Set(
      [
        ...(getState(channelsAtom).channelsByServerId[serverId] ?? []),
        ...(getState(serversAtom).serverWithChannelsById[serverId]?.channels ??
          []),
      ].flatMap((channel) =>
        channel.kind === "text" ? [channel.text_channel_id] : []
      )
    ),
  ];
}

function removeMessageState(deletedTextChannelIds: string[]): void {
  setState(messagesAtom, (state) => ({
    hasFetchedByTextChannelId: omitRecordKeys(
      state.hasFetchedByTextChannelId,
      deletedTextChannelIds
    ),
    messagesByTextChannelId: omitRecordKeys(
      state.messagesByTextChannelId,
      deletedTextChannelIds
    ),
    isLoadingByTextChannelId: omitRecordKeys(
      state.isLoadingByTextChannelId,
      deletedTextChannelIds
    ),
    errorByTextChannelId: omitRecordKeys(
      state.errorByTextChannelId,
      deletedTextChannelIds
    ),
  }));
}

function removeLoadedServerState(serverId: string): void {
  const deletedTextChannelIds = getKnownTextChannelIdsForServer(serverId);

  setState(membershipsAtom, (state) => ({
    membershipsByUserRefKey: Object.fromEntries(
      Object.entries(state.membershipsByUserRefKey).map(
        ([userKey, memberships]) => [
          userKey,
          removeMembership(memberships, serverId),
        ]
      )
    ),
    membersByServerId: omitRecordKey(state.membersByServerId, serverId),
    hasFetchedMembersByServerId: omitRecordKey(
      state.hasFetchedMembersByServerId,
      serverId
    ),
  }));
  removeMessageState(deletedTextChannelIds);
  setState(channelsAtom, (state) => ({
    channelsByServerId: omitRecordKey(state.channelsByServerId, serverId),
    channelById: omitRecordKeys(
      state.channelById,
      (state.channelsByServerId[serverId] ?? []).map((channel) => channel.id)
    ),
  }));
  setState(navigationAtom, (state) => ({
    selectedServerId:
      state.selectedServerId === serverId ? null : state.selectedServerId,
    selectedChannelIdByServerId: omitRecordKey(
      state.selectedChannelIdByServerId,
      serverId
    ),
  }));
  setState(serversAtom, (state) => ({
    serverById: omitRecordKey(state.serverById, serverId),
    serverWithChannelsById: omitRecordKey(
      state.serverWithChannelsById,
      serverId
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
  const serverId = membership.server.id;
  if (
    !(userKey in state.membershipsByUserRefKey) &&
    !(serverId in state.membersByServerId)
  ) {
    debugRunelink("skip membership_upserted", {
      serverId,
      user: membership.user,
    });
    return;
  }

  debugRunelink("apply membership_upserted", {
    serverId,
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
    ...(serverId in currentState.membersByServerId && {
      membersByServerId: {
        ...currentState.membersByServerId,
        [serverId]: upsertMember(
          currentState.membersByServerId[serverId] ?? [],
          toServerMember(membership)
        ),
      },
    }),
  }));
}

function handleMembershipDeleted(serverId: string, userRef: UserRef): void {
  const state = getState(membershipsAtom);
  const activeAccount = authAtom.pipe(getState, getActiveAccount);
  const userKey = userRefKey(userRef);
  const membership = (state.membershipsByUserRefKey[userKey] ?? []).find(
    (innerMembership) => innerMembership.server.id === serverId
  );
  const hasMembers = serverId in state.membersByServerId;

  if (!membership && !hasMembers) {
    debugRunelink("skip membership_deleted", { serverId, userRef });
    return;
  }

  if (activeAccount !== null && userRefKey(activeAccount) === userKey) {
    debugRunelink("remove server state for active account membership_deleted", {
      serverId,
      userRef,
    });
    // The server cache follows renames, unlike the membership
    const title = getState(serversAtom).serverById[serverId]?.title;
    removeLoadedServerState(serverId);
    if (
      membership &&
      !isDeletingMembership(serverId, userRef) &&
      !isDeletingAccount(userRef)
    ) {
      notify?.(
        `You're no longer a member of ${title ?? membership.server.title}.`
      );
    }
    return;
  }

  debugRunelink("apply membership_deleted", { serverId, userRef });

  setState(membershipsAtom, (currentState) => ({
    ...(membership && {
      membershipsByUserRefKey: {
        ...currentState.membershipsByUserRefKey,
        [userKey]: removeMembership(
          currentState.membershipsByUserRefKey[userKey] ?? [],
          serverId
        ),
      },
    }),
    ...(hasMembers && {
      membersByServerId: {
        ...currentState.membersByServerId,
        [serverId]: removeMember(
          currentState.membersByServerId[serverId] ?? [],
          userRef
        ),
      },
    }),
  }));
}

function handleServerUpsert(server: Server): void {
  const { serverById, serverWithChannelsById } = getState(serversAtom);
  const previous =
    serverById[server.id] ?? serverWithChannelsById[server.id]?.server;
  if (previous != null && compareResourceVersions(previous, server) > 0) return;
  if (!isLoadedServer(server.id)) {
    return;
  }

  setState(serversAtom, (state) => {
    const withChannels = state.serverWithChannelsById[server.id];
    return {
      serverById: { ...state.serverById, [server.id]: server },
      ...(withChannels != null && {
        serverWithChannelsById: {
          ...state.serverWithChannelsById,
          [server.id]: { ...withChannels, server },
        },
      }),
    };
  });
}

function handleChannelUpsert(channel: ServerChannel): void {
  if (!isLoadedServer(channel.server_id)) {
    return;
  }

  applyChannelUpserts(channel.server_id, [channel]);
}

function handleChannelDeleted(serverId: string, channelId: string): void {
  if (!isLoadedServer(serverId)) {
    return;
  }

  const channel =
    getState(channelsAtom).channelById[channelId] ??
    getState(serversAtom).serverWithChannelsById[serverId]?.channels.find(
      (matchedChannel) => matchedChannel.id === channelId
    );
  if (channel?.kind === "text") {
    removeMessageState([channel.text_channel_id]);
  }
  removeChannelFromCaches(serverId, channelId);
  setState(navigationAtom, (state) => ({
    selectedChannelIdByServerId: {
      ...state.selectedChannelIdByServerId,
      [serverId]:
        state.selectedChannelIdByServerId[serverId] === channelId
          ? null
          : (state.selectedChannelIdByServerId[serverId] ?? null),
    },
  }));
}

function handleMessageUpsert(message: Message): void {
  captureChannelNavigationUpdate(message);
  const textChannelId = message.text_channel_id;
  if (!(textChannelId in getState(messagesAtom).messagesByTextChannelId)) {
    return;
  }

  setState(messagesAtom, (state) => ({
    messagesByTextChannelId: {
      ...state.messagesByTextChannelId,
      [textChannelId]: mergeMessages(
        state.messagesByTextChannelId[textChannelId] ?? [],
        [message]
      ),
    },
  }));
  if (
    message.deleted_at !== null &&
    closeMessageEdit(message.id) &&
    !isDeletingMessage(message.id)
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
      handleMembershipDeleted(update.data.server_id, update.data.user_ref);
      break;
    }
    case "server_upserted": {
      handleServerUpsert(update.data);
      break;
    }
    case "server_deleted": {
      if (isLoadedServer(update.data.server_id)) {
        removeLoadedServerState(update.data.server_id);
      }
      break;
    }
    case "channel_upserted": {
      handleChannelUpsert(update.data);
      break;
    }
    case "channel_deleted": {
      handleChannelDeleted(update.data.server_id, update.data.channel_id);
      break;
    }
    case "message_upserted": {
      handleMessageUpsert(update.data);
      break;
    }
  }
}
