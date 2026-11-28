import { omitRecordKey } from "./record";
import { sameUserRef } from "./account-storage";
import { serverRefOf, resourceKey } from "@runelink/sdk";
import type {
  NewServerChannel,
  ServerChannel,
  ServerChannelId,
  ServerChannelMove,
  ServerRef,
} from "@runelink/sdk";
import * as Effect from "effect/Effect";
import { getState, setState } from "@/lib/atom-registry";
import { authAtom, getActiveAccount } from "@/lib/auth-store";
import { NotConnectedError, request } from "@/lib/runelink-session";
import {
  bindStoreToActiveAccount,
  channelRefOf,
} from "@/lib/runelink-store-utils";
import { channelsAtom, initialChannelsState } from "@/lib/channel-state";
import {
  newestChannel,
  newestChannels,
  serversAtom,
} from "@/lib/servers-store";

// Channel lists hold one server's channels, which share its host, so channels
// in them are identified by ID alone.
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
  channelId: ServerChannelId
): readonly ServerChannel[] {
  return channels.filter((channel) => channel.id !== channelId);
}

export const createChannel = Effect.fn("Channels.create")(function* (
  serverRef: ServerRef,
  newChannel: NewServerChannel
) {
  const reply = yield* request({
    type: "channels_create",
    data: {
      server_ref: serverRef,
      new_channel: newChannel,
    },
  });

  const channel = newestChannel(reply.data);
  const serverKey = resourceKey(serverRef);
  setState(channelsAtom, (state) => ({
    channelsByServerKey: {
      ...state.channelsByServerKey,
      [serverKey]: upsertChannel(
        state.channelsByServerKey[serverKey] ?? [],
        channel
      ),
    },
    channelByKey: {
      ...state.channelByKey,
      [resourceKey(channel)]: channel,
    },
  }));

  return reply.data;
});

// A channel and the server it is in
type ChannelLocation = Pick<ServerChannel, "host" | "id" | "server_id">;

export const deleteChannel = Effect.fn("Channels.delete")(function* (
  channel: ChannelLocation
) {
  const account = authAtom.pipe(getState, getActiveAccount);
  if (!account) {
    return yield* new NotConnectedError();
  }

  yield* request({
    type: "channels_delete",
    data: { channel_ref: { host: channel.host, id: channel.id } },
  }).pipe(
    // Already deleted, such as by another admin or tab
    Effect.catchTags({ RunelinkNotFoundError: () => Effect.void })
  );

  if (sameUserRef(account, authAtom.pipe(getState, getActiveAccount))) {
    removeChannelFromCaches(serverRefOf(channel), channel.id);
  }
  return undefined;
});

// Removes a deleted channel from the channel and server stores
export function removeChannelFromCaches(
  serverRef: ServerRef,
  channelId: ServerChannelId
): void {
  const serverKey = resourceKey(serverRef);
  setState(channelsAtom, (state) => ({
    channelsByServerKey: {
      ...state.channelsByServerKey,
      [serverKey]: removeChannel(
        state.channelsByServerKey[serverKey] ?? [],
        channelId
      ),
    },
    channelByKey: omitRecordKey(
      state.channelByKey,
      resourceKey(channelRefOf(serverRef, channelId))
    ),
  }));

  setState(serversAtom, (state) => {
    const cached = state.serverWithChannelsByKey[serverKey];
    if (cached == null) return {};

    return {
      serverWithChannelsByKey: {
        ...state.serverWithChannelsByKey,
        [serverKey]: {
          ...cached,
          channels: removeChannel(cached.channels, channelId),
        },
      },
    };
  });
}

export const moveChannel = Effect.fn("Channels.move")(function* (
  channel: ChannelLocation,
  channelMove: ServerChannelMove
) {
  const reply = yield* request({
    type: "channels_move",
    data: {
      channel_ref: { host: channel.host, id: channel.id },
      channel_move: channelMove,
    },
  });

  applyChannelUpserts(serverRefOf(channel), reply.data);
  return reply.data;
});

// Apply upserted channels of a server to the channel and server stores
export function applyChannelUpserts(
  serverRef: ServerRef,
  upserted: readonly ServerChannel[]
): void {
  const channels = newestChannels(upserted);
  const serverKey = resourceKey(serverRef);
  setState(channelsAtom, (state) => {
    const channelByKey = { ...state.channelByKey };
    for (const channel of channels) {
      channelByKey[resourceKey(channel)] = channel;
    }
    return {
      channelsByServerKey: {
        ...state.channelsByServerKey,
        [serverKey]: upsertChannels(
          state.channelsByServerKey[serverKey] ?? [],
          channels
        ),
      },
      channelByKey,
    };
  });

  setState(serversAtom, (state) => {
    const cached = state.serverWithChannelsByKey[serverKey];
    if (cached == null) return {};

    return {
      serverWithChannelsByKey: {
        ...state.serverWithChannelsByKey,
        [serverKey]: {
          ...cached,
          channels: upsertChannels(cached.channels, channels),
        },
      },
    };
  });
}

bindStoreToActiveAccount(() => {
  setState(channelsAtom, initialChannelsState);
});
