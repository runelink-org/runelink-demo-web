import { omitRecordKey } from "./record";
import { sameUserRef } from "./account-storage";
import type {
  NewServerChannel,
  ServerChannel,
  ServerChannelMove,
} from "@runelink/sdk";
import * as Effect from "effect/Effect";
import { getState, setState } from "@/lib/atom-registry";
import { authAtom, getActiveAccount } from "@/lib/auth-store";
import { NotConnectedError, request } from "@/lib/runelink-session";
import { bindStoreToActiveAccount } from "@/lib/runelink-store-utils";
import type {
  ChannelId,
  ServerId,
  TargetHost,
} from "@/lib/runelink-store-utils";
import { channelsAtom, initialChannelsState } from "@/lib/channel-state";
import {
  newestChannel,
  newestChannels,
  serversAtom,
} from "@/lib/servers-store";

function upsertChannel(
  channels: readonly ServerChannel[],
  nextChannel: ServerChannel
): readonly ServerChannel[] {
  return [
    ...channels.filter((channel) => channel.id !== nextChannel.id),
    nextChannel,
  ];
}

function upsertChannels(
  channels: readonly ServerChannel[],
  nextChannels: readonly ServerChannel[]
): readonly ServerChannel[] {
  let updated = channels;
  for (const channel of nextChannels) {
    updated = upsertChannel(updated, channel);
  }
  return updated;
}

function removeChannel(
  channels: readonly ServerChannel[],
  channelId: ChannelId
): readonly ServerChannel[] {
  return channels.filter((channel) => channel.id !== channelId);
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

  const channel = newestChannel(reply.data);
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
  const account = authAtom.pipe(getState, getActiveAccount);
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

  if (sameUserRef(account, authAtom.pipe(getState, getActiveAccount))) {
    removeChannelFromCaches(serverId, channelId);
  }
  return undefined;
});

// Removes a deleted channel from the channel and server stores
export function removeChannelFromCaches(
  serverId: ServerId,
  channelId: ChannelId
): void {
  setState(channelsAtom, (state) => {
    const channelById = omitRecordKey(state.channelById, channelId);
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
    if (server == null) return {};

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
  upserted: readonly ServerChannel[]
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
    if (server == null) return {};

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
  setState(channelsAtom, initialChannelsState);
});
