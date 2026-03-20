import { type Channel, type NewChannel } from "@runelink/sdk";
import { create } from "zustand";
import { requestExpected } from "@/lib/runelink-request";
import {
  bindStoreToActiveAccount,
  type ChannelId,
  type ServerId,
  type TargetHost,
} from "@/lib/runelink-store-utils";

type ChannelsState = {
  channelsByServerId: Record<string, Channel[]>;
  channelById: Record<string, Channel>;
  isLoading: boolean;
  isLoadingByServerId: Record<string, boolean>;
  error: string | null;
  errorByServerId: Record<string, string | null>;
  fetchChannels: (targetHost?: TargetHost) => Promise<Channel[]>;
  fetchChannelsByServer: (
    serverId: ServerId,
    targetHost?: TargetHost
  ) => Promise<Channel[]>;
  fetchChannelById: (
    serverId: ServerId,
    channelId: ChannelId,
    targetHost?: TargetHost
  ) => Promise<Channel>;
  createChannel: (
    serverId: ServerId,
    newChannel: NewChannel,
    targetHost?: TargetHost
  ) => Promise<Channel>;
  deleteChannel: (
    serverId: ServerId,
    channelId: ChannelId,
    targetHost?: TargetHost
  ) => Promise<void>;
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

function upsertChannel(channels: Channel[], nextChannel: Channel): Channel[] {
  return [
    ...channels.filter((channel) => channel.id !== nextChannel.id),
    nextChannel,
  ];
}

function removeChannel(channels: Channel[], channelId: ChannelId): Channel[] {
  return channels.filter((channel) => channel.id !== channelId);
}

function groupChannelsByServer(channels: Channel[]): Record<string, Channel[]> {
  return channels.reduce<Record<string, Channel[]>>((groups, channel) => {
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

      const groupedChannels = groupChannelsByServer(reply.data);
      const channelById = Object.fromEntries(
        reply.data.map((channel) => [channel.id, channel])
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

      const channelById = Object.fromEntries(
        reply.data.map((channel) => [channel.id, channel])
      );

      set((state) => ({
        channelsByServerId: {
          ...state.channelsByServerId,
          [serverId]: reply.data,
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

  async fetchChannelById(serverId, channelId, targetHost = null) {
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
      const reply = await requestExpected("channels_get_by_id", {
        type: "channels_get_by_id",
        data: {
          server_id: serverId,
          channel_id: channelId,
          target_host: targetHost,
        },
      });

      set((state) => ({
        channelsByServerId: {
          ...state.channelsByServerId,
          [serverId]: upsertChannel(
            state.channelsByServerId[serverId] ?? [],
            reply.data
          ),
        },
        channelById: {
          ...state.channelById,
          [reply.data.id]: reply.data,
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
        error instanceof Error ? error.message : "Failed to load channel";
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

      set((state) => ({
        channelsByServerId: {
          ...state.channelsByServerId,
          [serverId]: upsertChannel(
            state.channelsByServerId[serverId] ?? [],
            reply.data
          ),
        },
        channelById: {
          ...state.channelById,
          [reply.data.id]: reply.data,
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
          server_id: serverId,
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

  reset() {
    set(initialState);
  },
}));

bindStoreToActiveAccount(() => {
  useChannelsStore.getState().reset();
});
