import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { createServer } from "vite";

let server;
let store;
let requests;
let hints;
let updates;
const storage = new Map();
const originalWindow = globalThis.window;
const message = {
  id: "message",
  text_channel_id: "channel",
  author: null,
  reply_to: null,
  body: "original",
  deleted_at: null,
  created_at: "2026-11-10T12:00:00Z",
  updated_at: "2026-11-10T12:00:00Z",
};

before(async () => {
  globalThis.window = {
    location: { protocol: "http:" },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
  };
  server = await createServer({
    server: { middlewareMode: true, ws: false },
    appType: "custom",
    plugins: [
      {
        name: "controlled-message-requests",
        enforce: "pre",
        load(id) {
          if (!id.endsWith("/src/lib/runelink-request.ts")) return;
          return `export const requests = [];
          export function requestExpected(type, request) {
            return new Promise((resolve, reject) => {
              requests.push({ type, request, resolve, reject });
            });
          }`;
        },
      },
    ],
  });
  hints = await server.ssrLoadModule("/src/lib/channel-navigation-hints.ts");
  updates = await server.ssrLoadModule("/src/lib/runelink-updates.ts");
  ({ requests } = await server.ssrLoadModule("/src/lib/runelink-request.ts"));
  ({ useMessagesStore: store } = await server.ssrLoadModule(
    "/src/lib/messages-store.ts"
  ));
});

after(async () => {
  globalThis.window = originalWindow;
  await server?.close();
});

beforeEach(() => {
  store.getState().reset();
  requests.length = 0;
  storage.clear();
});

function reply(request, messages = [message]) {
  request.resolve({ type: "messages_get_by_text_channel", data: messages });
}

test("prefetch and selection share an in-flight request and retain cached history", async () => {
  const prefetch = store
    .getState()
    .fetchMessagesByTextChannel("channel", "peer.example");
  const selection = store
    .getState()
    .fetchMessagesByTextChannel("channel", "peer.example");
  assert.equal(prefetch, selection);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].request.data.target_host, "peer.example");
  reply(requests[0]);
  await prefetch;
  assert.deepEqual(
    await store.getState().fetchMessagesByTextChannel("channel"),
    [message]
  );
  assert.equal(requests.length, 1);
  assert.equal(store.getState().isLoadingByTextChannelId.channel, false);
});

test("history preserves live edits received during a prefetch", async () => {
  const pending = store.getState().fetchMessagesByTextChannel("channel");
  assert.deepEqual(store.getState().messagesByTextChannelId.channel, []);
  const edited = {
    ...message,
    body: "edited",
    updated_at: "2026-11-10T12:01:00Z",
  };
  store.setState({ messagesByTextChannelId: { channel: [edited] } });
  reply(requests[0]);
  await pending;
  assert.deepEqual(store.getState().messagesByTextChannelId.channel, [edited]);
});

test("a failed prefetch can retry when the channel opens", async () => {
  const pending = store.getState().fetchMessagesByTextChannel("channel");
  requests[0].reject(new Error("offline"));
  await assert.rejects(pending, /offline/);
  assert.equal(store.getState().isLoadingByTextChannelId.channel, false);
  const retry = store.getState().fetchMessagesByTextChannel("channel");
  assert.equal(store.getState().errorByTextChannelId.channel, null);
  assert.equal(requests.length, 2);
  reply(requests[1]);
  await retry;
  assert.equal(store.getState().hasFetchedByTextChannelId.channel, true);
});

for (const fails of [false, true]) {
  test(`reset ignores an old account's late ${fails ? "failure" : "history"} without disturbing a new fetch`, async () => {
    const old = store.getState().fetchMessagesByTextChannel("channel");
    store.getState().reset();
    const current = store.getState().fetchMessagesByTextChannel("channel");
    if (fails) {
      requests[0].reject(new Error("old failure"));
      await assert.rejects(old, /old failure/);
    } else {
      reply(requests[0]);
      await old;
    }
    assert.deepEqual(store.getState().messagesByTextChannelId.channel, []);
    assert.equal(store.getState().errorByTextChannelId.channel, null);
    assert.equal(store.getState().isLoadingByTextChannelId.channel, true);
    assert.equal(
      store.getState().fetchMessagesByTextChannel("channel"),
      current
    );
    reply(requests[1], []);
    await current;
    assert.deepEqual(store.getState().messagesByTextChannelId.channel, []);
    assert.equal(store.getState().hasFetchedByTextChannelId.channel, true);
  });
}

const account = { name: "alice", host: "example.com" };
const serverId = "11111111-1111-4111-8111-111111111111";
const channelId = "22222222-2222-4222-8222-222222222222";
const textId = "33333333-3333-4333-8333-333333333333";
const otherChannelId = "44444444-4444-4444-8444-444444444444";
const otherTextId = "55555555-5555-4555-8555-555555555555";
const route = { screen: "channel", serverId, channelId };
const hintedMessage = { ...message, text_channel_id: textId };
function remember(
  host = "peer.example",
  channels = [
    { id: channelId, kind: "text", text_channel_id: textId },
    { id: otherChannelId, kind: "text", text_channel_id: otherTextId },
  ]
) {
  hints.rememberChannelNavigationHints(account, {
    [serverId]: { server: { id: serverId, host }, channels },
  });
}

test("all known channel mappings can start a request in a new tab, scoped by account", () => {
  remember();
  hints.startChannelNavigationPrefetch({ ...account, name: "bob" }, route);
  assert.equal(requests.length, 0);
  hints.startChannelNavigationPrefetch(account, {
    ...route,
    channelId: otherChannelId,
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].request.data.text_channel_id, otherTextId);
  assert.equal(requests[0].request.data.target_host, "peer.example");
  assert.deepEqual(store.getState().messagesByTextChannelId, {});
  reply(requests[0], []);
});

test("speculative history stays hidden until metadata confirms it, retaining live edits", async () => {
  remember();
  hints.startChannelNavigationPrefetch(account, route);
  reply(requests[0], [hintedMessage]);
  await Promise.resolve();
  await Promise.resolve();
  const edited = {
    ...hintedMessage,
    body: "live edit",
    updated_at: "2026-11-10T12:01:00Z",
  };
  updates.handleRunelinkUpdate({ type: "message_upserted", data: edited });
  assert.deepEqual(store.getState().messagesByTextChannelId, {});
  await store.getState().fetchMessagesByTextChannel(textId, "peer.example");
  assert.equal(requests.length, 1);
  assert.deepEqual(store.getState().messagesByTextChannelId[textId], [edited]);
});

test("confirming metadata while speculation is pending shares the request", async () => {
  remember();
  hints.startChannelNavigationPrefetch(account, route);
  const selected = store
    .getState()
    .fetchMessagesByTextChannel(textId, "peer.example");
  assert.equal(requests.length, 1);
  reply(requests[0], [hintedMessage]);
  await selected;
  assert.equal(store.getState().hasFetchedByTextChannelId[textId], true);
});

for (const changedHost of [false, true]) {
  test(`a stale ${changedHost ? "host" : "text-channel ID"} is discarded and fresh metadata wins`, async () => {
    remember();
    hints.startChannelNavigationPrefetch(account, route);
    const correctId = changedHost ? textId : otherTextId;
    const correctHost = changedHost ? "new-peer.example" : "peer.example";
    const selected = store
      .getState()
      .fetchMessagesByTextChannel(correctId, correctHost);
    assert.equal(requests.length, 2);
    reply(requests[0], [hintedMessage]);
    reply(requests[1], []);
    await selected;
    assert.deepEqual(store.getState().messagesByTextChannelId, {
      [correctId]: [],
    });
    assert.equal(store.getState().hasFetchedByTextChannelId[correctId], true);
  });
}

test("failed speculation falls back to an ordinary request", async () => {
  remember();
  hints.startChannelNavigationPrefetch(account, route);
  requests[0].reject(new Error("stale hint"));
  const selected = store
    .getState()
    .fetchMessagesByTextChannel(textId, "peer.example");
  // Allow the failed speculative request to reach the fallback.
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests.length, 2);
  reply(requests[1], []);
  await selected;
  assert.equal(store.getState().errorByTextChannelId[textId], null);
});

test("reset during speculation prevents a fallback request under the next account", async () => {
  remember();
  hints.startChannelNavigationPrefetch(account, route);
  const selected = store
    .getState()
    .fetchMessagesByTextChannel(textId, "peer.example");
  store.getState().reset();
  requests[0].reject(new Error("old account"));
  await selected;
  assert.equal(requests.length, 1);
  assert.deepEqual(store.getState().messagesByTextChannelId, {});
});

test("fresh snapshots remove deleted channel hints and categories, preserving other accounts", () => {
  remember();
  hints.rememberChannelNavigationHints(
    { ...account, name: "bob" },
    {
      [serverId]: {
        server: { id: serverId, host: "peer.example" },
        channels: [{ id: channelId, kind: "text", text_channel_id: textId }],
      },
    }
  );
  remember("peer.example", [{ id: channelId, kind: "category" }]);
  hints.startChannelNavigationPrefetch(account, route);
  hints.startChannelNavigationPrefetch(account, {
    ...route,
    channelId: otherChannelId,
  });
  assert.equal(requests.length, 0);
  hints.startChannelNavigationPrefetch({ ...account, name: "bob" }, route);
  assert.equal(requests.length, 1);
  reply(requests[0], []);
});

test("blocked or malformed storage falls back without disrupting normal loading", async () => {
  storage.set("runelink.demo.channel-navigation-hints", "{bad json");
  hints.startChannelNavigationPrefetch(account, route);
  assert.equal(requests.length, 0);
  const setItem = window.localStorage.setItem;
  window.localStorage.setItem = () => {
    throw new Error("quota");
  };
  try {
    remember();
  } finally {
    window.localStorage.setItem = setItem;
  }
  const selected = store.getState().fetchMessagesByTextChannel(textId);
  reply(requests[0], []);
  await selected;
});

test("startup does not refetch a channel already cached or loading on reconnect", () => {
  remember();
  hints.startChannelNavigationPrefetch(account, route, { [textId]: [] });
  assert.equal(requests.length, 0);
});
