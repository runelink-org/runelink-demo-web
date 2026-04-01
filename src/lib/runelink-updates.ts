import type {
  Channel,
  FullServerMembership,
  Message,
  Server,
  ServerMembership,
  ServerMember,
  User,
  UserRef,
  WsUpdate,
} from "@runelink/sdk";
import { getActiveAccount, useAuthStore } from "@/lib/auth-store";
import { useChannelsStore } from "@/lib/channels-store";
import { upsertMembership } from "@/lib/membership-utils";
import { useMembershipsStore } from "@/lib/memberships-store";
import { useMessagesStore } from "@/lib/messages-store";
import { useNavigationStore } from "@/lib/navigation-store";
import {
  serverChannelKey,
  serverUserKey,
  userRefKey,
} from "@/lib/runelink-store-utils";
import { debugRunelink } from "@/lib/runelink-debug";
import { useServersStore } from "@/lib/servers-store";
import { useUsersStore } from "@/lib/users-store";

function upsertById<T extends { id: string }>(items: T[], nextItem: T): T[] {
  return [...items.filter((item) => item.id !== nextItem.id), nextItem];
}

function removeById<T extends { id: string }>(items: T[], id: string): T[] {
  return items.filter((item) => item.id !== id);
}

function omitRecordKey<T>(
  record: Record<string, T>,
  key: string
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).filter(([entryKey]) => entryKey !== key)
  );
}

function omitRecordKeys<T>(
  record: Record<string, T>,
  keys: Iterable<string>
): Record<string, T> {
  const blockedKeys = new Set(keys);

  return Object.fromEntries(
    Object.entries(record).filter(([entryKey]) => !blockedKeys.has(entryKey))
  );
}

function filterRecord<T>(
  record: Record<string, T>,
  predicate: (entryKey: string, value: T) => boolean
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).filter(([entryKey, value]) =>
      predicate(entryKey, value)
    )
  );
}

function upsertUser(users: User[], nextUser: User): User[] {
  const key = userRefKey(nextUser);
  return [...users.filter((user) => userRefKey(user) !== key), nextUser];
}

function upsertMember(
  members: ServerMember[],
  nextMember: ServerMember
): ServerMember[] {
  const key = userRefKey(nextMember.user);
  return [
    ...members.filter((member) => userRefKey(member.user) !== key),
    nextMember,
  ];
}

function removeMember(
  members: ServerMember[],
  userRef: UserRef
): ServerMember[] {
  const key = userRefKey(userRef);
  return members.filter((member) => userRefKey(member.user) !== key);
}

function removeMembership(
  memberships: ServerMembership[],
  serverId: string
): ServerMembership[] {
  return memberships.filter((membership) => membership.server.id !== serverId);
}

function upsertMessage(messages: Message[], nextMessage: Message): Message[] {
  return sortMessages(upsertById(messages, nextMessage));
}

function removeMessage(messages: Message[], messageId: string): Message[] {
  return messages.filter((message) => message.id !== messageId);
}

function sortMessages(messages: Message[]): Message[] {
  return [...messages].sort(
    (left, right) => left.created_at.getTime() - right.created_at.getTime()
  );
}

function toServerMember(membership: FullServerMembership): ServerMember {
  return {
    user: membership.user,
    role: membership.role,
    joined_at: membership.joined_at,
    updated_at: membership.updated_at,
  };
}

function toServerMembership(
  membership: FullServerMembership,
  userRef: UserRef
): ServerMembership {
  return {
    server: membership.server,
    user_ref: userRef,
    role: membership.role,
    joined_at: membership.joined_at,
    updated_at: membership.updated_at,
    synced_at: membership.synced_at,
  };
}

function isLoadedUser(user: User): boolean {
  const state = useUsersStore.getState();
  return userRefKey(user) in state.userByRefKey;
}

function isLoadedServer(serverId: string): boolean {
  const state = useServersStore.getState();
  return (
    serverId in state.serverById || serverId in state.serverWithChannelsById
  );
}

function isLoadedChannel(serverId: string, channelId: string): boolean {
  const state = useMessagesStore.getState();
  return serverChannelKey(serverId, channelId) in state.messagesByChannelKey;
}

function findLoadedServerIdByChannel(channelId: string): string | null {
  const serverState = useServersStore.getState();

  for (const serverWithChannels of Object.values(
    serverState.serverWithChannelsById
  )) {
    if (
      serverWithChannels.channels.some((channel) => channel.id === channelId)
    ) {
      return serverWithChannels.server.id;
    }
  }

  const channelState = useChannelsStore.getState();
  const channel = channelState.channelById[channelId];
  return channel?.server_id ?? null;
}

function getKnownChannelIdsForServer(serverId: string): string[] {
  const channelState = useChannelsStore.getState();
  const serverState = useServersStore.getState();

  return Array.from(
    new Set([
      ...(channelState.channelsByServerId[serverId] ?? []).map(
        (channel) => channel.id
      ),
      ...(serverState.serverWithChannelsById[serverId]?.channels ?? []).map(
        (channel) => channel.id
      ),
    ])
  );
}

function removeServerMembershipState(serverId: string): void {
  useMembershipsStore.setState((state) => ({
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
    memberByServerAndUserKey: filterRecord(
      state.memberByServerAndUserKey,
      (key) => !key.startsWith(`${serverId}:`)
    ),
  }));
}

function removeServerChannelState(serverId: string): void {
  useChannelsStore.setState((state) => {
    const nextChannelById = { ...state.channelById };

    for (const channel of state.channelsByServerId[serverId] ?? []) {
      delete nextChannelById[channel.id];
    }

    return {
      channelsByServerId: omitRecordKey(state.channelsByServerId, serverId),
      channelById: nextChannelById,
      isLoadingByServerId: omitRecordKey(state.isLoadingByServerId, serverId),
      errorByServerId: omitRecordKey(state.errorByServerId, serverId),
    };
  });
}

function removeServerMessageState(
  serverId: string,
  deletedChannelIds: string[]
): void {
  const deletedChannelIdSet = new Set(deletedChannelIds);
  const deletedChannelKeys = deletedChannelIds.map((channelId) =>
    serverChannelKey(serverId, channelId)
  );

  useMessagesStore.setState((state) => {
    const nextMessageById = { ...state.messageById };

    for (const channelKey of deletedChannelKeys) {
      for (const message of state.messagesByChannelKey[channelKey] ?? []) {
        delete nextMessageById[message.id];
      }
    }

    return {
      allMessages: state.allMessages.filter(
        (message) => !deletedChannelIdSet.has(message.channel_id)
      ),
      messagesByServerId: omitRecordKey(state.messagesByServerId, serverId),
      messagesByChannelKey: omitRecordKeys(
        state.messagesByChannelKey,
        deletedChannelKeys
      ),
      messageById: nextMessageById,
      isLoadingByServerId: omitRecordKey(state.isLoadingByServerId, serverId),
      isLoadingByChannelKey: omitRecordKeys(
        state.isLoadingByChannelKey,
        deletedChannelKeys
      ),
      errorByServerId: omitRecordKey(state.errorByServerId, serverId),
      errorByChannelKey: omitRecordKeys(
        state.errorByChannelKey,
        deletedChannelKeys
      ),
    };
  });
}

function removeServerNavigationState(serverId: string): void {
  useNavigationStore.setState((state) => ({
    selectedServerId:
      state.selectedServerId === serverId ? null : state.selectedServerId,
    selectedChannelIdByServerId: omitRecordKey(
      state.selectedChannelIdByServerId,
      serverId
    ),
  }));
}

function removeServerStoreState(serverId: string): void {
  useServersStore.setState((state) => ({
    servers: removeById(state.servers, serverId),
    serverById: omitRecordKey(state.serverById, serverId),
    serverWithChannelsById: omitRecordKey(
      state.serverWithChannelsById,
      serverId
    ),
  }));
}

function removeLoadedServerState(serverId: string): void {
  const deletedChannelIds = getKnownChannelIdsForServer(serverId);

  removeServerMembershipState(serverId);
  removeServerMessageState(serverId, deletedChannelIds);
  removeServerChannelState(serverId);
  removeServerNavigationState(serverId);
  removeServerStoreState(serverId);
}

function removeChannelMessageState(serverId: string, channelId: string): void {
  const channelKey = serverChannelKey(serverId, channelId);

  useMessagesStore.setState((state) => {
    const nextMessageById = { ...state.messageById };

    for (const message of state.messagesByChannelKey[channelKey] ?? []) {
      delete nextMessageById[message.id];
    }

    return {
      allMessages: state.allMessages.filter(
        (message) => message.channel_id !== channelId
      ),
      messagesByServerId: {
        ...state.messagesByServerId,
        [serverId]: (state.messagesByServerId[serverId] ?? []).filter(
          (message) => message.channel_id !== channelId
        ),
      },
      messagesByChannelKey: omitRecordKey(
        state.messagesByChannelKey,
        channelKey
      ),
      messageById: nextMessageById,
      isLoadingByChannelKey: omitRecordKey(
        state.isLoadingByChannelKey,
        channelKey
      ),
      errorByChannelKey: omitRecordKey(state.errorByChannelKey, channelKey),
    };
  });
}

function removeChannelStoreState(serverId: string, channelId: string): void {
  useChannelsStore.setState((state) => {
    const nextChannels = removeById(
      state.channelsByServerId[serverId] ?? [],
      channelId
    );

    return {
      channelsByServerId: {
        ...state.channelsByServerId,
        [serverId]: nextChannels,
      },
      channelById: omitRecordKey(state.channelById, channelId),
    };
  });

  useServersStore.setState((state) => {
    if (!(serverId in state.serverWithChannelsById)) {
      return {};
    }

    return {
      serverWithChannelsById: {
        ...state.serverWithChannelsById,
        [serverId]: {
          ...state.serverWithChannelsById[serverId],
          channels: removeById(
            state.serverWithChannelsById[serverId].channels,
            channelId
          ),
        },
      },
    };
  });
}

function removeChannelNavigationState(
  serverId: string,
  channelId: string
): void {
  useNavigationStore.setState((state) => ({
    selectedChannelIdByServerId: {
      ...state.selectedChannelIdByServerId,
      [serverId]:
        state.selectedChannelIdByServerId[serverId] === channelId
          ? null
          : (state.selectedChannelIdByServerId[serverId] ?? null),
    },
  }));
}

function shouldApplyMembershipUpdate(
  membership: FullServerMembership
): boolean {
  const state = useMembershipsStore.getState();
  const userKey = userRefKey(membership.user);

  return (
    userKey in state.membershipsByUserRefKey ||
    membership.server.id in state.membersByServerId ||
    serverUserKey(membership.server.id, membership.user) in
      state.memberByServerAndUserKey
  );
}

function handleUserUpsert(user: User): void {
  if (!isLoadedUser(user)) {
    return;
  }

  useUsersStore.setState((state) => ({
    users: upsertUser(state.users, user),
    userByRefKey: {
      ...state.userByRefKey,
      [userRefKey(user)]: user,
    },
  }));
}

function handleUserDeleted(userRef: UserRef): void {
  const userKey = userRefKey(userRef);
  if (!(userKey in useUsersStore.getState().userByRefKey)) {
    return;
  }

  useUsersStore.setState((state) => {
    return {
      users: state.users.filter((user) => userRefKey(user) !== userKey),
      userByRefKey: omitRecordKey(state.userByRefKey, userKey),
      associatedHostsByUserRefKey: omitRecordKey(
        state.associatedHostsByUserRefKey,
        userKey
      ),
    };
  });
}

function handleMembershipUpsert(membership: FullServerMembership): void {
  if (!shouldApplyMembershipUpdate(membership)) {
    debugRunelink("skip membership_upserted", {
      serverId: membership.server.id,
      user: membership.user,
    });
    return;
  }

  debugRunelink("apply membership_upserted", {
    serverId: membership.server.id,
    user: membership.user,
  });

  const member = toServerMember(membership);
  const membershipEntry = toServerMembership(membership, membership.user);
  const userKey = userRefKey(membership.user);
  const memberKey = serverUserKey(membership.server.id, membership.user);

  useMembershipsStore.setState((state) => {
    const nextState: Partial<typeof state> = {};

    if (userKey in state.membershipsByUserRefKey) {
      nextState.membershipsByUserRefKey = {
        ...state.membershipsByUserRefKey,
        [userKey]: upsertMembership(
          state.membershipsByUserRefKey[userKey] ?? [],
          membershipEntry
        ),
      };
    }

    if (membership.server.id in state.membersByServerId) {
      nextState.membersByServerId = {
        ...state.membersByServerId,
        [membership.server.id]: upsertMember(
          state.membersByServerId[membership.server.id] ?? [],
          member
        ),
      };
    }

    if (
      membership.server.id in state.membersByServerId ||
      memberKey in state.memberByServerAndUserKey
    ) {
      nextState.memberByServerAndUserKey = {
        ...state.memberByServerAndUserKey,
        [memberKey]: member,
      };
    }

    return nextState;
  });
}

function handleMembershipDeleted(serverId: string, userRef: UserRef): void {
  const state = useMembershipsStore.getState();
  const activeAccount = getActiveAccount(useAuthStore.getState());
  const userKey = userRefKey(userRef);
  const memberKey = serverUserKey(serverId, userRef);
  const hasMembership = (state.membershipsByUserRefKey[userKey] ?? []).some(
    (membership) => membership.server.id === serverId
  );
  const hasMembers = serverId in state.membersByServerId;
  const hasMember = memberKey in state.memberByServerAndUserKey;
  const isActiveAccountMembership =
    activeAccount !== null && userRefKey(activeAccount) === userKey;

  if (!hasMembership && !hasMembers && !hasMember) {
    debugRunelink("skip membership_deleted", {
      serverId,
      userRef,
    });
    return;
  }

  if (isActiveAccountMembership) {
    debugRunelink("remove server state for active account membership_deleted", {
      serverId,
      userRef,
    });
    removeLoadedServerState(serverId);
    return;
  }

  debugRunelink("apply membership_deleted", {
    serverId,
    userRef,
  });

  useMembershipsStore.setState((currentState) => {
    const nextState: Partial<typeof currentState> = {};

    if (hasMembership) {
      nextState.membershipsByUserRefKey = {
        ...currentState.membershipsByUserRefKey,
        [userKey]: removeMembership(
          currentState.membershipsByUserRefKey[userKey] ?? [],
          serverId
        ),
      };
    }

    if (hasMembers) {
      nextState.membersByServerId = {
        ...currentState.membersByServerId,
        [serverId]: removeMember(
          currentState.membersByServerId[serverId] ?? [],
          userRef
        ),
      };
    }

    if (hasMember) {
      const nextMemberByServerAndUserKey = {
        ...currentState.memberByServerAndUserKey,
      };
      delete nextMemberByServerAndUserKey[memberKey];
      nextState.memberByServerAndUserKey = nextMemberByServerAndUserKey;
    }

    return nextState;
  });
}

function handleServerUpsert(server: Server): void {
  if (!isLoadedServer(server.id)) {
    return;
  }

  useServersStore.setState((state) => {
    const nextState: Partial<typeof state> = {
      servers: upsertById(state.servers, server),
      serverById: {
        ...state.serverById,
        [server.id]: server,
      },
    };

    if (server.id in state.serverWithChannelsById) {
      nextState.serverWithChannelsById = {
        ...state.serverWithChannelsById,
        [server.id]: {
          ...state.serverWithChannelsById[server.id],
          server,
        },
      };
    }

    return nextState;
  });
}

function handleServerDeleted(serverId: string): void {
  if (!isLoadedServer(serverId)) {
    return;
  }

  removeLoadedServerState(serverId);
}

function handleChannelUpsert(channel: Channel): void {
  if (!isLoadedServer(channel.server_id)) {
    return;
  }

  useChannelsStore.setState((state) => ({
    channelsByServerId: {
      ...state.channelsByServerId,
      [channel.server_id]: upsertById(
        state.channelsByServerId[channel.server_id] ?? [],
        channel
      ),
    },
    channelById: {
      ...state.channelById,
      [channel.id]: channel,
    },
  }));

  useServersStore.setState((state) => {
    if (!(channel.server_id in state.serverWithChannelsById)) {
      return {};
    }

    return {
      serverWithChannelsById: {
        ...state.serverWithChannelsById,
        [channel.server_id]: {
          ...state.serverWithChannelsById[channel.server_id],
          channels: upsertById(
            state.serverWithChannelsById[channel.server_id].channels,
            channel
          ),
        },
      },
    };
  });
}

function handleChannelDeleted(serverId: string, channelId: string): void {
  if (!isLoadedServer(serverId)) {
    return;
  }

  removeChannelMessageState(serverId, channelId);
  removeChannelStoreState(serverId, channelId);
  removeChannelNavigationState(serverId, channelId);
}

function handleMessageUpsert(message: Message): void {
  const serverId = findLoadedServerIdByChannel(message.channel_id);
  if (!serverId || !isLoadedChannel(serverId, message.channel_id)) {
    return;
  }

  const channelKey = serverChannelKey(serverId, message.channel_id);

  useMessagesStore.setState((state) => {
    const nextState: Partial<typeof state> = {
      messagesByChannelKey: {
        ...state.messagesByChannelKey,
        [channelKey]: upsertMessage(
          state.messagesByChannelKey[channelKey] ?? [],
          message
        ),
      },
      messageById: {
        ...state.messageById,
        [message.id]: message,
      },
    };

    if (serverId in state.messagesByServerId) {
      nextState.messagesByServerId = {
        ...state.messagesByServerId,
        [serverId]: upsertMessage(
          state.messagesByServerId[serverId] ?? [],
          message
        ),
      };
    }

    if (state.allMessages.length > 0 || message.id in state.messageById) {
      nextState.allMessages = upsertMessage(state.allMessages, message);
    }

    return nextState;
  });
}

function handleMessageDeleted(
  serverId: string,
  channelId: string,
  messageId: string
): void {
  if (!isLoadedChannel(serverId, channelId)) {
    return;
  }

  const channelKey = serverChannelKey(serverId, channelId);

  useMessagesStore.setState((state) => {
    const nextState: Partial<typeof state> = {
      messagesByChannelKey: {
        ...state.messagesByChannelKey,
        [channelKey]: removeMessage(
          state.messagesByChannelKey[channelKey] ?? [],
          messageId
        ),
      },
    };

    if (serverId in state.messagesByServerId) {
      nextState.messagesByServerId = {
        ...state.messagesByServerId,
        [serverId]: removeMessage(
          state.messagesByServerId[serverId] ?? [],
          messageId
        ),
      };
    }

    if (state.allMessages.length > 0 || messageId in state.messageById) {
      nextState.allMessages = removeMessage(state.allMessages, messageId);
    }

    if (messageId in state.messageById) {
      const nextMessageById = { ...state.messageById };
      delete nextMessageById[messageId];
      nextState.messageById = nextMessageById;
    }

    return nextState;
  });
}

export function handleRunelinkUpdate(update: WsUpdate): void {
  debugRunelink("ws update", update);
  switch (update.type) {
    case "user_upserted":
      handleUserUpsert(update.data);
      break;
    case "user_deleted":
      handleUserDeleted(update.data.user_ref);
      break;
    case "membership_upserted":
      handleMembershipUpsert(update.data);
      break;
    case "membership_deleted":
      handleMembershipDeleted(update.data.server_id, update.data.user_ref);
      break;
    case "server_upserted":
      handleServerUpsert(update.data);
      break;
    case "server_deleted":
      handleServerDeleted(update.data.server_id);
      break;
    case "channel_upserted":
      handleChannelUpsert(update.data);
      break;
    case "channel_deleted":
      handleChannelDeleted(update.data.server_id, update.data.channel_id);
      break;
    case "message_upserted":
      handleMessageUpsert(update.data);
      break;
    case "message_deleted":
      handleMessageDeleted(
        update.data.server_id,
        update.data.channel_id,
        update.data.message_id
      );
      break;
  }
}
