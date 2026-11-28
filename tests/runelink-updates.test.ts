import type * as AtomRegistryModule from "../src/lib/atom-registry.ts";
import type * as ChannelStateModule from "../src/lib/channel-state.ts";
import type * as ComposerStoreModule from "../src/lib/message-composer-store.ts";
import type * as MembershipsStoreModule from "../src/lib/memberships-store.ts";
import type * as MessagesStoreModule from "../src/lib/messages-store.ts";
import type * as RunelinkUpdatesModule from "../src/lib/runelink-updates.ts";
import type * as ServersStoreModule from "../src/lib/servers-store.ts";
import assert from "node:assert/strict";
import { afterAll, beforeAll, beforeEach, it, vi } from "@effect/vitest";
import { resourceKey } from "@runelink/sdk";
import type { ActiveMessage, Message, ServerChannel } from "@runelink/sdk";
import * as Effect from "effect/Effect";
import * as fixtures from "./fixtures.ts";

let registry: typeof AtomRegistryModule.appAtomRegistry;
let channels: typeof ChannelStateModule;
let composer: typeof ComposerStoreModule;
let memberships: typeof MembershipsStoreModule;
let messages: typeof MessagesStoreModule;
let updates: typeof RunelinkUpdatesModule;
let servers: typeof ServersStoreModule;

// Two servers on different hosts with the same IDs throughout
const serverId = fixtures.serverId(fixtures.uuid(1));
const channelId = fixtures.serverChannelId(fixtures.uuid(2));
const textChannelId = fixtures.textChannelId(fixtures.uuid(3));
const messageId = fixtures.messageId(fixtures.uuid(4));
const hosts = ["a.example", "b.example"] as const;
const at = "2026-11-27T12:00:00Z";
const bob = {
  name: "bob",
  host: "a.example",
  role: "user" as const,
  created_at: at,
  updated_at: at,
  synced_at: null,
};

function server(host: string) {
  return {
    id: serverId,
    host,
    title: host,
    description: null,
    created_at: at,
    updated_at: at,
  };
}

function channel(host: string): ServerChannel {
  return {
    id: channelId,
    host,
    server_id: serverId,
    kind: "text",
    text_channel_id: textChannelId,
    title: "general",
    description: null,
    parent_channel_id: null,
    position: 0,
    created_at: at,
    updated_at: at,
  };
}

function message(host: string, body = "hello"): ActiveMessage {
  return {
    id: messageId,
    host,
    text_channel_id: textChannelId,
    author: null,
    reply_to: null,
    body,
    deleted_at: null,
    edited_at: null,
    created_at: at,
    updated_at: at,
  };
}

const serverKey = (host: string) => resourceKey(server(host));
const textChannelKey = (host: string) =>
  resourceKey({ host, id: textChannelId });

beforeAll(() =>
  Effect.gen(function* () {
    vi.stubGlobal("window", {
      location: { protocol: "http:" },
      localStorage: { getItem: () => null, setItem: () => undefined },
    });
    ({ appAtomRegistry: registry } = yield* Effect.promise(
      () => import("../src/lib/atom-registry.ts")
    ));
    channels = yield* Effect.promise(
      () => import("../src/lib/channel-state.ts")
    );
    memberships = yield* Effect.promise(
      () => import("../src/lib/memberships-store.ts")
    );
    messages = yield* Effect.promise(
      () => import("../src/lib/messages-store.ts")
    );
    servers = yield* Effect.promise(
      () => import("../src/lib/servers-store.ts")
    );
    composer = yield* Effect.promise(
      () => import("../src/lib/message-composer-store.ts")
    );
    updates = yield* Effect.promise(
      () => import("../src/lib/runelink-updates.ts")
    );
  })
);

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  registry.set(composer.messageComposerAtom, {});
  const entries = <T>(value: (host: string) => T) =>
    Object.fromEntries(hosts.map((host) => [serverKey(host), value(host)]));
  registry.set(servers.serversAtom, {
    serverByKey: entries(server),
    serverWithChannelsByKey: entries((host) => ({
      server: server(host),
      channels: [channel(host)],
    })),
  });
  registry.set(channels.channelsAtom, {
    channelsByServerKey: entries((host) => [channel(host)]),
    channelByKey: Object.fromEntries(
      hosts.map((host) => [resourceKey(channel(host)), channel(host)])
    ),
  });
  registry.set(memberships.membershipsAtom, {
    membershipsByUserRefKey: {},
    membersByServerKey: entries(() => [
      { user: bob, role: "member" as const, joined_at: at, updated_at: at },
    ]),
    hasFetchedMembersByServerKey: entries(() => true),
    isLoadingByServerKey: {},
  });
  registry.set(messages.messagesAtom, {
    messagesByTextChannelKey: Object.fromEntries(
      hosts.map((host) => [textChannelKey(host), [message(host)]])
    ),
    hasFetchedByTextChannelKey: {},
    isLoadingByTextChannelKey: {},
    errorByTextChannelKey: {},
  });
});

const [a, b] = hosts;

it("updates about a server affect it and not another host's with the same ID", () => {
  updates.handleRunelinkUpdate({
    type: "message_upserted",
    data: message(a, "edited"),
  });
  const byTextChannel = registry.get(
    messages.messagesAtom
  ).messagesByTextChannelKey;
  assert.equal(byTextChannel[textChannelKey(a)]?.[0]?.body, "edited");
  assert.equal(byTextChannel[textChannelKey(b)]?.[0]?.body, "hello");

  updates.handleRunelinkUpdate({
    type: "membership_deleted",
    data: { server: { host: a, id: serverId }, user_ref: bob },
  });
  const members = registry.get(memberships.membershipsAtom).membersByServerKey;
  assert.deepEqual(members[serverKey(a)], []);
  assert.equal(members[serverKey(b)]?.length, 1);

  updates.handleRunelinkUpdate({
    type: "channel_deleted",
    data: { server: { host: a, id: serverId }, channel_id: channelId },
  });
  const channelState = registry.get(channels.channelsAtom);
  assert.deepEqual(channelState.channelsByServerKey[serverKey(a)], []);
  assert.equal(channelState.channelsByServerKey[serverKey(b)]?.length, 1);
  assert.ok(!(resourceKey(channel(a)) in channelState.channelByKey));
  assert.ok(resourceKey(channel(b)) in channelState.channelByKey);
  const messageState = registry.get(messages.messagesAtom);
  assert.ok(!(textChannelKey(a) in messageState.messagesByTextChannelKey));
  assert.ok(textChannelKey(b) in messageState.messagesByTextChannelKey);

  updates.handleRunelinkUpdate({
    type: "server_deleted",
    data: { server: { host: a, id: serverId } },
  });
  const serverState = registry.get(servers.serversAtom);
  assert.deepEqual(Object.keys(serverState.serverByKey), [serverKey(b)]);
  assert.deepEqual(Object.keys(serverState.serverWithChannelsByKey), [
    serverKey(b),
  ]);
  assert.ok(
    serverKey(b) in registry.get(memberships.membershipsAtom).membersByServerKey
  );
});

it("deleting a message closes only its own host's edit", () => {
  const edit = (host: string) => {
    composer.updateComposer(resourceKey(channel(host)), (current) => ({
      ...current,
      focusedInput: "edit",
      editing: {
        session: {},
        message: message(host),
        body: "draft",
        selection: null,
        isSaving: false,
        error: null,
      },
    }));
  };
  edit(a);
  edit(b);
  const deleted: Message = {
    ...message(a),
    body: null,
    deleted_at: at,
  };
  updates.handleRunelinkUpdate({ type: "message_upserted", data: deleted });
  assert.equal(composer.getComposer(resourceKey(channel(a))).editing, null);
  assert.notEqual(composer.getComposer(resourceKey(channel(b))).editing, null);
});
