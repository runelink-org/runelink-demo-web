import { newestResource } from "./resource-version";
import { newestChannels } from "./channels-store";
import type { NewServer, Server, ServerWithChannels } from "@runelink/sdk";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import { setState, stateAtom } from "@/lib/atom-registry";
import { request } from "@/lib/runelink-session";
import type { RequestFailure, RunelinkSession } from "@/lib/runelink-session";
import { bindStoreToActiveAccount } from "@/lib/runelink-store-utils";
import type { ServerId, TargetHost } from "@/lib/runelink-store-utils";

type ServersState = {
  serverById: Record<string, Server>;
  serverWithChannelsById: Record<string, ServerWithChannels>;
};

const initialState: ServersState = {
  serverById: {},
  serverWithChannelsById: {},
};

export const serversAtom = stateAtom(initialState);

type ServerWithChannelsLoad = Deferred.Deferred<
  ServerWithChannels,
  RequestFailure
>;
let pendingServerWithChannelsLoads = new Map<string, ServerWithChannelsLoad>();

function cachedServer(
  state: ServersState,
  serverId: ServerId
): Server | undefined {
  return (
    state.serverById[serverId] ?? state.serverWithChannelsById[serverId]?.server
  );
}

export const fetchServers = Effect.fn("Servers.fetchAll")(function* (
  targetHost: TargetHost = null
) {
  const reply = yield* request({
    type: "servers_get_all",
    data: { target_host: targetHost },
  });

  setState(serversAtom, (state) => ({
    serverById: {
      ...state.serverById,
      ...Object.fromEntries(
        reply.data.map((server) => [
          server.id,
          newestResource(server, cachedServer(state, server.id)),
        ])
      ),
    },
  }));

  return reply.data;
});

const loadServerWithChannels = Effect.fn("Servers.fetchWithChannels")(
  function* (serverId: ServerId, targetHost: TargetHost) {
    const reply = yield* request({
      type: "servers_get_with_channels",
      data: {
        server_id: serverId,
        target_host: targetHost,
      },
    });

    setState(serversAtom, (state) => {
      const server = newestResource(
        reply.data.server,
        cachedServer(state, serverId)
      );
      const channels = newestChannels(reply.data.channels);
      return {
        serverById: { ...state.serverById, [serverId]: server },
        serverWithChannelsById: {
          ...state.serverWithChannelsById,
          [serverId]: { server, channels },
        },
      };
    });

    return reply.data;
  }
);

// Loads a server with its channels. Concurrent callers, such as the server
// load and a new membership, share one request.
export function fetchServerWithChannels(
  serverId: ServerId,
  targetHost: TargetHost = null
): Effect.Effect<ServerWithChannels, RequestFailure, RunelinkSession> {
  // Uninterruptible until the shared load is running, so it is never
  // registered without starting
  return Effect.uninterruptibleMask((restore) =>
    Effect.suspend(() => {
      const pending = pendingServerWithChannelsLoads.get(serverId);
      if (pending) return restore(Deferred.await(pending));

      // Reset replaces this map, so an old account's load is never shared
      const loads = pendingServerWithChannelsLoads;
      const load: ServerWithChannelsLoad = Deferred.makeUnsafe();
      loads.set(serverId, load);
      // Detached, so a caller that stops waiting does not cancel the load for
      // the others
      return Effect.forkDetach(
        Deferred.into(
          loadServerWithChannels(serverId, targetHost).pipe(
            Effect.ensuring(Effect.sync(() => loads.delete(serverId)))
          ),
          load
        ),
        { startImmediately: true }
      ).pipe(Effect.andThen(restore(Deferred.await(load))));
    })
  );
}

export const createServer = Effect.fn("Servers.create")(function* (
  newServer: NewServer,
  targetHost: TargetHost = null
) {
  const reply = yield* request({
    type: "servers_create",
    data: {
      new_server: newServer,
      target_host: targetHost,
    },
  });

  setState(serversAtom, (state) => {
    const server = newestResource(
      reply.data,
      cachedServer(state, reply.data.id)
    );
    return { serverById: { ...state.serverById, [server.id]: server } };
  });
  return reply.data;
});

export const deleteServer = Effect.fn("Servers.delete")(function* (
  serverId: ServerId,
  targetHost: TargetHost = null
) {
  yield* request({
    type: "servers_delete",
    data: {
      server_id: serverId,
      target_host: targetHost,
    },
  });

  setState(serversAtom, (state) => {
    const serverById = { ...state.serverById };
    const serverWithChannelsById = { ...state.serverWithChannelsById };
    delete serverById[serverId];
    delete serverWithChannelsById[serverId];
    return { serverById, serverWithChannelsById };
  });
});

bindStoreToActiveAccount(() => {
  pendingServerWithChannelsLoads = new Map();
  setState(serversAtom, initialState);
});
