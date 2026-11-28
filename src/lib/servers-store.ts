import { omitRecordKey } from "./record";
import { newestResource } from "./resource-version";
import { channelsAtom } from "./channel-state";
import { serverRefOf, resourceKey } from "@runelink/sdk";
import type {
  NewServer,
  ResourceKey,
  Server,
  ServerChannel,
  ServerId,
  ServerRef,
  ServerWithChannels,
} from "@runelink/sdk";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import { getState, setState, stateAtom } from "@/lib/atom-registry";
import { request } from "@/lib/runelink-session";
import type { RequestFailure, RunelinkSession } from "@/lib/runelink-session";
import { bindStoreToActiveAccount } from "@/lib/runelink-store-utils";
import type { TargetHost } from "@/lib/runelink-store-utils";

type ServersState = {
  serverByKey: Record<ResourceKey<ServerId>, Server>;
  serverWithChannelsByKey: Record<ResourceKey<ServerId>, ServerWithChannels>;
};

const initialState: ServersState = {
  serverByKey: {},
  serverWithChannelsByKey: {},
};

export const serversAtom = stateAtom(initialState);

export function newestChannel(
  channel: ServerChannel,
  byKey = getState(channelsAtom).channelByKey,
  servers = getState(serversAtom).serverWithChannelsByKey
): ServerChannel {
  return newestResource(
    newestResource(channel, byKey[resourceKey(channel)]),
    servers[resourceKey(serverRefOf(channel))]?.channels.find(
      (cached) => cached.id === channel.id
    )
  );
}

export function newestChannels(
  channels: readonly ServerChannel[]
): readonly ServerChannel[] {
  const byKey = getState(channelsAtom).channelByKey;
  const servers = getState(serversAtom).serverWithChannelsByKey;
  return channels.map((channel) => newestChannel(channel, byKey, servers));
}

type ServerWithChannelsLoad = Deferred.Deferred<
  ServerWithChannels,
  RequestFailure
>;
let pendingServerWithChannelsLoads = new Map<
  ResourceKey<ServerId>,
  ServerWithChannelsLoad
>();

function cachedServer(
  state: ServersState,
  key: ResourceKey<ServerId>
): Server | undefined {
  return state.serverByKey[key] ?? state.serverWithChannelsByKey[key]?.server;
}

export const fetchServers = Effect.fn("Servers.fetchAll")(function* (
  targetHost: TargetHost = null
) {
  const reply = yield* request({
    type: "servers_get_all",
    data: { target_host: targetHost },
  });

  setState(serversAtom, (state) => {
    const serverByKey = { ...state.serverByKey };
    for (const server of reply.data) {
      const key = resourceKey(server);
      serverByKey[key] = newestResource(server, cachedServer(state, key));
    }
    return { serverByKey };
  });

  return reply.data;
});

const loadServerWithChannels = Effect.fn("Servers.fetchWithChannels")(
  function* (serverRef: ServerRef) {
    const reply = yield* request({
      type: "servers_get_with_channels",
      data: { server_ref: serverRef },
    });

    const key = resourceKey(serverRef);
    setState(serversAtom, (state) => {
      const server = newestResource(
        reply.data.server,
        cachedServer(state, key)
      );
      const channels = newestChannels(reply.data.channels);
      return {
        serverByKey: { ...state.serverByKey, [key]: server },
        serverWithChannelsByKey: {
          ...state.serverWithChannelsByKey,
          [key]: { server, channels },
        },
      };
    });

    return reply.data;
  }
);

// Loads a server with its channels. Concurrent callers, such as the server
// load and a new membership, share one request.
export function fetchServerWithChannels(
  serverRef: ServerRef
): Effect.Effect<ServerWithChannels, RequestFailure, RunelinkSession> {
  const key = resourceKey(serverRef);
  // Uninterruptible until the shared load is running, so it is never
  // registered without starting
  return Effect.uninterruptibleMask((restore) =>
    Effect.suspend(() => {
      const pending = pendingServerWithChannelsLoads.get(key);
      if (pending) return restore(Deferred.await(pending));

      // Reset replaces this map, so an old account's load is never shared
      const loads = pendingServerWithChannelsLoads;
      const load: ServerWithChannelsLoad = Deferred.makeUnsafe();
      loads.set(key, load);
      // Detached, so a caller that stops waiting does not cancel the load for
      // the others
      return Effect.forkDetach(
        Deferred.into(
          loadServerWithChannels(serverRef).pipe(
            Effect.ensuring(Effect.sync(() => loads.delete(key)))
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

  const key = resourceKey(reply.data);
  setState(serversAtom, (state) => ({
    serverByKey: {
      ...state.serverByKey,
      [key]: newestResource(reply.data, cachedServer(state, key)),
    },
  }));
  return reply.data;
});

export const deleteServer = Effect.fn("Servers.delete")(function* (
  serverRef: ServerRef
) {
  yield* request({
    type: "servers_delete",
    data: { server_ref: serverRef },
  });

  const key = resourceKey(serverRef);
  setState(serversAtom, (state) => ({
    serverByKey: omitRecordKey(state.serverByKey, key),
    serverWithChannelsByKey: omitRecordKey(state.serverWithChannelsByKey, key),
  }));
});

bindStoreToActiveAccount(() => {
  pendingServerWithChannelsLoads = new Map();
  setState(serversAtom, initialState);
});
