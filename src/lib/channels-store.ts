import { newestResource } from "./resource-version";
import {
  type NewServerChannel,
  type ServerChannel,
  type ServerChannelMove,
} from "@runelink/sdk";
import { create } from "zustand";
import { requestExpected } from "@/lib/runelink-request";
import {
  bindStoreToActiveAccount,
  type ChannelId,
  type ServerId,
  type TargetHost,
} from "@/lib/runelink-store-utils";
import { useServersStore } from "@/lib/servers-store";

type ChannelsState = {
  channelsByServerId: Record<string, ServerChannel[]>;
  channelById: Record<string, ServerChannel>;
  isLoading: boolean;
  isLoadingByServerId: Record<string, boolean>;
  error: string | null;
  errorByServerId: Record<string, string | null>;
  fetchChannels: (targetHost?: TargetHost) => Promise<ServerChannel[]>;
  fetchChannelsByServer: (
    serverId: ServerId,
    targetHost?: TargetHost
  ) => Promise<ServerChannel[]>;
  createChannel: (
    serverId: ServerId,
    newChannel: NewServerChannel,
    targetHost?: TargetHost
  ) => Promise<ServerChannel>;
  deleteChannel: (
    serverId: ServerId,
    channelId: ChannelId,
    targetHost?: TargetHost
  ) => Promise<void>;
  moveChannel: (
    serverId: ServerId,
    channelId: ChannelId,
    channelMove: ServerChannelMove,
    targetHost?: TargetHost
  ) => Promise<ServerChannel[]>;
  reset: () => void;
};

const initialState = {
  channelsByServerId: {},
  channelById: {},
  isLoading: false,
  isLoadingByServerId: {},
  error: null,
  errorByServerId: {},
};

function upsertChannel(
  channels: ServerChannel[],
  nextChannel: ServerChannel
): ServerChannel[] {
  return [
    ...channels.filter((channel) => channel.id !== nextChannel.id),
    nextChannel,
  ];
}

function upsertChannels(
  channels: ServerChannel[],
  nextChannels: ServerChannel[]
): ServerChannel[] {
  return nextChannels.reduce(upsertChannel, channels);
}

function removeChannel(
  channels: ServerChannel[],
  channelId: ChannelId
): ServerChannel[] {
  return channels.filter((channel) => channel.id !== channelId);
}

export function newestChannels(channels: ServerChannel[]): ServerChannel[] {
  const byId = useChannelsStore.getState().channelById;
  const servers = useServersStore.getState().serverWithChannelsById;
  return channels.map((channel) =>
    newestResource(
      newestResource(channel, byId[channel.id]),
      servers[channel.server_id]?.channels.find(
        (cached) => cached.id === channel.id
      )
    )
  );
}

function groupChannelsByServer(
  channels: ServerChannel[]
): Record<string, ServerChannel[]> {
  return channels.reduce<Record<string, ServerChannel[]>>((groups, channel) => {
    const existingChannels = groups[channel.server_id] ?? [];
    groups[channel.server_id] = [...existingChannels, channel];
    return groups;
  }, {});
}

export const useChannelsStore = create<ChannelsState>((set) => ({
  ...initialState,

  async fetchChannels(targetHost = null) {
    set({ isLoading: true, error: null });

    try {
      const reply = await requestExpected("channels_get_all", {
        type: "channels_get_all",
        data: { target_host: targetHost },
      });

      const channels = newestChannels(reply.data);
      const groupedChannels = groupChannelsByServer(channels);
      const channelById = Object.fromEntries(
        channels.map((channel) => [channel.id, channel])
      );

      set((state) => ({
        channelsByServerId: {
          ...state.channelsByServerId,
          ...groupedChannels,
        },
        channelById: {
          ...state.channelById,
          ...channelById,
        },
        isLoading: false,
        error: null,
      }));

      return reply.data;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load channels";
      set({ isLoading: false, error: message });
      throw error;
    }
  },

  async fetchChannelsByServer(serverId, targetHost = null) {
    set((state) => ({
      isLoadingByServerId: {
        ...state.isLoadingByServerId,
        [serverId]: true,
      },
      errorByServerId: {
        ...state.errorByServerId,
        [serverId]: null,
      },
    }));

    try {
      const reply = await requestExpected("channels_get_by_server", {
        type: "channels_get_by_server",
        data: {
          server_id: serverId,
          target_host: targetHost,
        },
      });

      const channels = newestChannels(reply.data);
      const channelById = Object.fromEntries(
        channels.map((channel) => [channel.id, channel])
      );

      set((state) => ({
        channelsByServerId: {
          ...state.channelsByServerId,
          [serverId]: channels,
        },
        channelById: {
          ...state.channelById,
          ...channelById,
        },
        isLoadingByServerId: {
          ...state.isLoadingByServerId,
          [serverId]: false,
        },
        errorByServerId: {
          ...state.errorByServerId,
          [serverId]: null,
        },
      }));

      return reply.data;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load server channels";
      set((state) => ({
        isLoadingByServerId: {
          ...state.isLoadingByServerId,
          [serverId]: false,
        },
        errorByServerId: {
          ...state.errorByServerId,
          [serverId]: message,
        },
      }));
      throw error;
    }
  },

  async createChannel(serverId, newChannel, targetHost = null) {
    set((state) => ({
      isLoadingByServerId: {
        ...state.isLoadingByServerId,
        [serverId]: true,
      },
      errorByServerId: {
        ...state.errorByServerId,
        [serverId]: null,
      },
    }));

    try {
      const reply = await requestExpected("channels_create", {
        type: "channels_create",
        data: {
          server_id: serverId,
          new_channel: newChannel,
          target_host: targetHost,
        },
      });

      const channel = newestChannels([reply.data])[0];
      set((state) => ({
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
        isLoadingByServerId: {
          ...state.isLoadingByServerId,
          [serverId]: false,
        },
        errorByServerId: {
          ...state.errorByServerId,
          [serverId]: null,
        },
      }));

      return reply.data;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create channel";
      set((state) => ({
        isLoadingByServerId: {
          ...state.isLoadingByServerId,
          [serverId]: false,
        },
        errorByServerId: {
          ...state.errorByServerId,
          [serverId]: message,
        },
      }));
      throw error;
    }
  },

  async deleteChannel(serverId, channelId, targetHost = null) {
    set((state) => ({
      isLoadingByServerId: {
        ...state.isLoadingByServerId,
        [serverId]: true,
      },
      errorByServerId: {
        ...state.errorByServerId,
        [serverId]: null,
      },
    }));

    try {
      await requestExpected("channels_delete", {
        type: "channels_delete",
        data: {
          channel_id: channelId,
          target_host: targetHost,
        },
      });

      set((state) => {
        const nextChannelById = { ...state.channelById };
        delete nextChannelById[channelId];

        return {
          channelsByServerId: {
            ...state.channelsByServerId,
            [serverId]: removeChannel(
              state.channelsByServerId[serverId] ?? [],
              channelId
            ),
          },
          channelById: nextChannelById,
          isLoadingByServerId: {
            ...state.isLoadingByServerId,
            [serverId]: false,
          },
          errorByServerId: {
            ...state.errorByServerId,
            [serverId]: null,
          },
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
              channels: removeChannel(
                state.serverWithChannelsById[serverId].channels,
                channelId
              ),
            },
          },
        };
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete channel";
      set((state) => ({
        isLoadingByServerId: {
          ...state.isLoadingByServerId,
          [serverId]: false,
        },
        errorByServerId: {
          ...state.errorByServerId,
          [serverId]: message,
        },
      }));
      throw error;
    }
  },

  async moveChannel(serverId, channelId, channelMove, targetHost = null) {
    const reply = await requestExpected("channels_move", {
      type: "channels_move",
      data: {
        channel_id: channelId,
        channel_move: channelMove,
        target_host: targetHost,
      },
    });

    applyChannelUpserts(serverId, reply.data);
    return reply.data;
  },

  reset() {
    set(initialState);
  },
}));

// Apply upserted channels of a server to the channel and server stores
export function applyChannelUpserts(
  serverId: ServerId,
  channels: ServerChannel[]
): void {
  channels = newestChannels(channels);
  useChannelsStore.setState((state) => ({
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

  useServersStore.setState((state) => {
    if (!(serverId in state.serverWithChannelsById)) {
      return {};
    }

    return {
      serverWithChannelsById: {
        ...state.serverWithChannelsById,
        [serverId]: {
          ...state.serverWithChannelsById[serverId],
          channels: upsertChannels(
            state.serverWithChannelsById[serverId].channels,
            channels
          ),
        },
      },
    };
  });
}

bindStoreToActiveAccount(() => {
  useChannelsStore.getState().reset();
});
