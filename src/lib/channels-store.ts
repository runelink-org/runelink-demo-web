import { sameUserRef } from "./account-storage";
import { newestResource } from "./resource-version";
import {
  type NewServerChannel,
  type ServerChannel,
  type ServerChannelMove,
} from "@runelink/sdk";
import * as Effect from "effect/Effect";
import { getState, setState, stateAtom } from "@/lib/atom-registry";
import { authAtom, getActiveAccount } from "@/lib/auth-store";
import { NotConnectedError, request } from "@/lib/runelink-session";
import {
  bindStoreToActiveAccount,
  type ChannelId,
  type ServerId,
  type TargetHost,
} from "@/lib/runelink-store-utils";
import { serversAtom } from "@/lib/servers-store";

type ChannelsState = {
  channelsByServerId: Record<string, ReadonlyArray<ServerChannel>>;
  channelById: Record<string, ServerChannel>;
};

const initialState: ChannelsState = {
  channelsByServerId: {},
  channelById: {},
};

export const channelsAtom = stateAtom(initialState);

function upsertChannel(
  channels: ReadonlyArray<ServerChannel>,
  nextChannel: ServerChannel
): ReadonlyArray<ServerChannel> {
  return [
    ...channels.filter((channel) => channel.id !== nextChannel.id),
    nextChannel,
  ];
}

function upsertChannels(
  channels: ReadonlyArray<ServerChannel>,
  nextChannels: ReadonlyArray<ServerChannel>
): ReadonlyArray<ServerChannel> {
  return nextChannels.reduce(upsertChannel, channels);
}

function removeChannel(
  channels: ReadonlyArray<ServerChannel>,
  channelId: ChannelId
): ReadonlyArray<ServerChannel> {
  return channels.filter((channel) => channel.id !== channelId);
}

export function newestChannels(
  channels: ReadonlyArray<ServerChannel>
): ReadonlyArray<ServerChannel> {
  const byId = getState(channelsAtom).channelById;
  const servers = getState(serversAtom).serverWithChannelsById;
  return channels.map((channel) =>
    newestResource(
      newestResource(channel, byId[channel.id]),
      servers[channel.server_id]?.channels.find(
        (cached) => cached.id === channel.id
      )
    )
  );
}

export const createChannel = Effect.fn("Channels.create")(function* (
  serverId: ServerId,
  newChannel: NewServerChannel,
  targetHost: TargetHost = null
) {
  const reply = yield* request({
    type: "channels_create",
    data: {
      server_id: serverId,
      new_channel: newChannel,
      target_host: targetHost,
    },
  });

  const channel = newestChannels([reply.data])[0];
  setState(channelsAtom, (state) => ({
    channelsByServerId: {
      ...state.channelsByServerId,
      [serverId]: upsertChannel(
        state.channelsByServerId[serverId] ?? [],
        channel
      ),
    },
    channelById: {
      ...state.channelById,
      [channel.id]: channel,
    },
  }));

  return reply.data;
});

export const deleteChannel = Effect.fn("Channels.delete")(function* (
  serverId: ServerId,
  channelId: ChannelId,
  targetHost: TargetHost = null
) {
  const account = getActiveAccount(getState(authAtom));
  if (!account) {
    return yield* new NotConnectedError();
  }

  yield* request({
    type: "channels_delete",
    data: {
      channel_id: channelId,
      target_host: targetHost,
    },
  }).pipe(
    // Already deleted, such as by another admin or tab
    Effect.catchTags({ RunelinkNotFoundError: () => Effect.void })
  );

  if (!sameUserRef(account, getActiveAccount(getState(authAtom)))) return;
  removeChannelFromCaches(serverId, channelId);
});

// Removes a deleted channel from the channel and server stores
export function removeChannelFromCaches(
  serverId: ServerId,
  channelId: ChannelId
): void {
  setState(channelsAtom, (state) => {
    const channelById = { ...state.channelById };
    delete channelById[channelId];
    return {
      channelsByServerId: {
        ...state.channelsByServerId,
        [serverId]: removeChannel(
          state.channelsByServerId[serverId] ?? [],
          channelId
        ),
      },
      channelById,
    };
  });

  setState(serversAtom, (state) => {
    const server = state.serverWithChannelsById[serverId];
    if (!server) {
      return {};
    }

    return {
      serverWithChannelsById: {
        ...state.serverWithChannelsById,
        [serverId]: {
          ...server,
          channels: removeChannel(server.channels, channelId),
        },
      },
    };
  });
}

export const moveChannel = Effect.fn("Channels.move")(function* (
  serverId: ServerId,
  channelId: ChannelId,
  channelMove: ServerChannelMove,
  targetHost: TargetHost = null
) {
  const reply = yield* request({
    type: "channels_move",
    data: {
      channel_id: channelId,
      channel_move: channelMove,
      target_host: targetHost,
    },
  });

  applyChannelUpserts(serverId, reply.data);
  return reply.data;
});

// Apply upserted channels of a server to the channel and server stores
export function applyChannelUpserts(
  serverId: ServerId,
  upserted: ReadonlyArray<ServerChannel>
): void {
  const channels = newestChannels(upserted);
  setState(channelsAtom, (state) => ({
    channelsByServerId: {
      ...state.channelsByServerId,
      [serverId]: upsertChannels(
        state.channelsByServerId[serverId] ?? [],
        channels
      ),
    },
    channelById: {
      ...state.channelById,
      ...Object.fromEntries(channels.map((channel) => [channel.id, channel])),
    },
  }));

  setState(serversAtom, (state) => {
    const server = state.serverWithChannelsById[serverId];
    if (!server) {
      return {};
    }

    return {
      serverWithChannelsById: {
        ...state.serverWithChannelsById,
        [serverId]: {
          ...server,
          channels: upsertChannels(server.channels, channels),
        },
      },
    };
  });
}

bindStoreToActiveAccount(() => {
  setState(channelsAtom, initialState);
});
