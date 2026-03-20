import {
  type NewServer,
  type Server,
  type ServerWithChannels,
} from "@runelink/sdk";
import { create } from "zustand";
import { requestExpected } from "@/lib/runelink-request";
import {
  bindStoreToActiveAccount,
  type ServerId,
  type TargetHost,
} from "@/lib/runelink-store-utils";

type ServersState = {
  servers: Server[];
  serverById: Record<string, Server>;
  serverWithChannelsById: Record<string, ServerWithChannels>;
  isLoading: boolean;
  error: string | null;
  fetchServers: (targetHost?: TargetHost) => Promise<Server[]>;
  fetchServerById: (
    serverId: ServerId,
    targetHost?: TargetHost
  ) => Promise<Server>;
  fetchServerWithChannels: (
    serverId: ServerId,
    targetHost?: TargetHost
  ) => Promise<ServerWithChannels>;
  createServer: (
    newServer: NewServer,
    targetHost?: TargetHost
  ) => Promise<Server>;
  deleteServer: (serverId: ServerId, targetHost?: TargetHost) => Promise<void>;
  reset: () => void;
};

const initialState = {
  servers: [],
  serverById: {},
  serverWithChannelsById: {},
  isLoading: false,
  error: null,
};

function upsertServer(servers: Server[], nextServer: Server): Server[] {
  return [
    ...servers.filter((server) => server.id !== nextServer.id),
    nextServer,
  ];
}

function removeServer(servers: Server[], serverId: ServerId): Server[] {
  return servers.filter((server) => server.id !== serverId);
}

export const useServersStore = create<ServersState>((set) => ({
  ...initialState,
  async fetchServers(targetHost = null) {
    set({ isLoading: true, error: null });

    try {
      const reply = await requestExpected("servers_get_all", {
        type: "servers_get_all",
        data: { target_host: targetHost },
      });

      const serverById = Object.fromEntries(
        reply.data.map((server) => [server.id, server])
      );

      set((state) => ({
        servers: reply.data,
        serverById: {
          ...state.serverById,
          ...serverById,
        },
        isLoading: false,
        error: null,
      }));

      return reply.data;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load servers";
      set({ isLoading: false, error: message });
      throw error;
    }
  },
  async fetchServerById(serverId, targetHost = null) {
    set({ isLoading: true, error: null });

    try {
      const reply = await requestExpected("servers_get_by_id", {
        type: "servers_get_by_id",
        data: {
          server_id: serverId,
          target_host: targetHost,
        },
      });

      set((state) => ({
        servers: upsertServer(state.servers, reply.data),
        serverById: {
          ...state.serverById,
          [reply.data.id]: reply.data,
        },
        isLoading: false,
        error: null,
      }));

      return reply.data;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load server";
      set({ isLoading: false, error: message });
      throw error;
    }
  },
  async fetchServerWithChannels(serverId, targetHost = null) {
    set({ isLoading: true, error: null });

    try {
      const reply = await requestExpected("servers_get_with_channels", {
        type: "servers_get_with_channels",
        data: {
          server_id: serverId,
          target_host: targetHost,
        },
      });

      set((state) => ({
        servers: upsertServer(state.servers, reply.data.server),
        serverById: {
          ...state.serverById,
          [reply.data.server.id]: reply.data.server,
        },
        serverWithChannelsById: {
          ...state.serverWithChannelsById,
          [reply.data.server.id]: reply.data,
        },
        isLoading: false,
        error: null,
      }));

      return reply.data;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load server details";
      set({ isLoading: false, error: message });
      throw error;
    }
  },
  async createServer(newServer, targetHost = null) {
    set({ isLoading: true, error: null });

    try {
      const reply = await requestExpected("servers_create", {
        type: "servers_create",
        data: {
          new_server: newServer,
          target_host: targetHost,
        },
      });

      set((state) => ({
        servers: upsertServer(state.servers, reply.data),
        serverById: {
          ...state.serverById,
          [reply.data.id]: reply.data,
        },
        isLoading: false,
        error: null,
      }));

      return reply.data;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create server";
      set({ isLoading: false, error: message });
      throw error;
    }
  },
  async deleteServer(serverId, targetHost = null) {
    set({ isLoading: true, error: null });

    try {
      await requestExpected("servers_delete", {
        type: "servers_delete",
        data: {
          server_id: serverId,
          target_host: targetHost,
        },
      });

      set((state) => {
        const nextServerById = { ...state.serverById };
        const nextServerWithChannelsById = { ...state.serverWithChannelsById };
        delete nextServerById[serverId];
        delete nextServerWithChannelsById[serverId];

        return {
          servers: removeServer(state.servers, serverId),
          serverById: nextServerById,
          serverWithChannelsById: nextServerWithChannelsById,
          isLoading: false,
          error: null,
        };
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete server";
      set({ isLoading: false, error: message });
      throw error;
    }
  },
  reset() {
    set(initialState);
  },
}));

bindStoreToActiveAccount(() => {
  useServersStore.getState().reset();
});
