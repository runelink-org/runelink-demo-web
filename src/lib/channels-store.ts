import { omitRecordKey } from "./record";
import { sameUserRef } from "./account-storage";
import { channelServerRef, resourceKey } from "@runelink/sdk";
import type {
  NewServerChannel,
  ResourceRef,
  ServerChannel,
  ServerChannelMove,
} from "@runelink/sdk";
import * as Effect from "effect/Effect";
import { getState, setState } from "@/lib/atom-registry";
import { authAtom, getActiveAccount } from "@/lib/auth-store";
import { NotConnectedError, request } from "@/lib/runelink-session";
import {
  bindStoreToActiveAccount,
  channelRef,
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
  channelId: string
): readonly ServerChannel[] {
  return channels.filter((channel) => channel.id !== channelId);
}

export const createChannel = Effect.fn("Channels.create")(function* (
  server: ResourceRef,
  newChannel: NewServerChannel
) {
  const reply = yield* request({
    type: "channels_create",
    data: {
      server,
      new_channel: newChannel,
    },
  });

  const channel = newestChannel(reply.data);
  const serverKey = resourceKey(server);
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
    data: { channel: { host: channel.host, id: channel.id } },
  }).pipe(
    // Already deleted, such as by another admin or tab
    Effect.catchTags({ RunelinkNotFoundError: () => Effect.void })
  );

  if (sameUserRef(account, authAtom.pipe(getState, getActiveAccount))) {
    removeChannelFromCaches(channelServerRef(channel), channel.id);
  }
  return undefined;
});

// Removes a deleted channel from the channel and server stores
export function removeChannelFromCaches(
  server: ResourceRef,
  channelId: string
): void {
  const serverKey = resourceKey(server);
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
      resourceKey(channelRef(server, channelId))
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
      channel: { host: channel.host, id: channel.id },
      channel_move: channelMove,
    },
  });

  applyChannelUpserts(channelServerRef(channel), reply.data);
  return reply.data;
});

// Apply upserted channels of a server to the channel and server stores
export function applyChannelUpserts(
  server: ResourceRef,
  upserted: readonly ServerChannel[]
): void {
  const channels = newestChannels(upserted);
  const serverKey = resourceKey(server);
  setState(channelsAtom, (state) => ({
    channelsByServerKey: {
      ...state.channelsByServerKey,
      [serverKey]: upsertChannels(
        state.channelsByServerKey[serverKey] ?? [],
        channels
      ),
    },
    channelByKey: {
      ...state.channelByKey,
      ...Object.fromEntries(
        channels.map((channel) => [resourceKey(channel), channel])
      ),
    },
  }));

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
