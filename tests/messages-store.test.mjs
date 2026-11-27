import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { createServer } from "vite";

let server;
let messages;
let registry;
let hints;
let updates;
let run;
let NotConnectedError;
const requests = [];
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
    // Keep a running dev server's optimized dependencies intact.
    cacheDir: "node_modules/.vite-test",
  });
  const session$ = await server.ssrLoadModule("/src/lib/runelink-session.ts");
  const { RunelinkSession } = session$;
  ({ NotConnectedError } = session$);
  // Requests wait until a test settles them.
  const session = Layer.succeed(
    RunelinkSession,
    RunelinkSession.of({
      request: (request) =>
        Effect.callback((resume) => {
          requests.push({
            type: request.type,
            request,
            resolve: (reply) => resume(Effect.succeed(reply)),
            reject: (error) => resume(Effect.fail(error)),
          });
        }),
    })
  );
  run = (effect) => Effect.runPromise(Effect.provide(effect, session));
  ({ appAtomRegistry: registry } = await server.ssrLoadModule(
    "/src/lib/atom-registry.ts"
  ));
  hints = await server.ssrLoadModule("/src/lib/channel-navigation-hints.ts");
  updates = await server.ssrLoadModule("/src/lib/runelink-updates.ts");
  messages = await server.ssrLoadModule("/src/lib/messages-store.ts");
});

function state() {
  return registry.get(messages.messagesAtom);
}

function fetchMessages(textChannelId, targetHost) {
  return run(messages.fetchMessagesByTextChannel(textChannelId, targetHost));
}

function startPrefetch(account, route, cachedMessages) {
  return run(
    hints.startChannelNavigationPrefetch(account, route, cachedMessages)
  );
}

after(async () => {
  globalThis.window = originalWindow;
  await server?.close();
});

beforeEach(() => {
  messages.resetMessages();
  requests.length = 0;
  storage.clear();
});

function reply(request, messages = [message]) {
  request.resolve({ type: "messages_get_by_text_channel", data: messages });
}

test("prefetch and selection share an in-flight request and retain cached history", async () => {
  const prefetch = fetchMessages("channel", "peer.example");
  const selection = fetchMessages("channel", "peer.example");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].request.data.target_host, "peer.example");
  reply(requests[0]);
  assert.deepEqual(await prefetch, [message]);
  assert.deepEqual(await selection, [message]);
  assert.deepEqual(await fetchMessages("channel"), [message]);
  assert.equal(requests.length, 1);
  assert.equal(state().isLoadingByTextChannelId.channel, false);
});

test("history preserves live edits received during a prefetch", async () => {
  const pending = fetchMessages("channel");
  assert.deepEqual(state().messagesByTextChannelId.channel, []);
  const edited = {
    ...message,
    body: "edited",
    updated_at: "2026-11-10T12:01:00Z",
  };
  registry.update(messages.messagesAtom, (state) => ({
    ...state,
    messagesByTextChannelId: { channel: [edited] },
  }));
  reply(requests[0]);
  await pending;
  assert.deepEqual(state().messagesByTextChannelId.channel, [edited]);
});

test("a failed prefetch can retry when the channel opens", async () => {
  const pending = fetchMessages("channel");
  requests[0].reject(new NotConnectedError());
  await assert.rejects(pending, { _tag: "NotConnectedError" });
  assert.equal(state().isLoadingByTextChannelId.channel, false);
  assert.equal(
    state().errorByTextChannelId.channel,
    "You're not connected. Try again once you're connected."
  );
  const retry = fetchMessages("channel");
  assert.equal(state().errorByTextChannelId.channel, null);
  assert.equal(requests.length, 2);
  reply(requests[1]);
  await retry;
  assert.equal(state().hasFetchedByTextChannelId.channel, true);
});

for (const fails of [false, true]) {
  test(`reset ignores an old account's late ${fails ? "failure" : "history"} without disturbing a new fetch`, async () => {
    const old = fetchMessages("channel");
    messages.resetMessages();
    const current = fetchMessages("channel");
    if (fails) {
      requests[0].reject(new Error("old failure"));
      await assert.rejects(old, /old failure/);
    } else {
      reply(requests[0]);
      await old;
    }
    assert.deepEqual(state().messagesByTextChannelId.channel, []);
    assert.equal(state().errorByTextChannelId.channel, null);
    assert.equal(state().isLoadingByTextChannelId.channel, true);
    const again = fetchMessages("channel");
    assert.equal(requests.length, 2);
    reply(requests[1], []);
    await current;
    await again;
    assert.deepEqual(state().messagesByTextChannelId.channel, []);
    assert.equal(state().hasFetchedByTextChannelId.channel, true);
  });
}

for (const fails of [false, true]) {
  test(`a late ${fails ? "failure" : "history"} does not restore a removed channel`, async () => {
    const empty = state();
    const pending = fetchMessages("channel");
    // Removed, such as by a deletion update
    registry.set(messages.messagesAtom, empty);
    if (fails) {
      requests[0].reject(new NotConnectedError());
      await assert.rejects(pending, { _tag: "NotConnectedError" });
    } else {
      reply(requests[0]);
      await pending;
    }
    assert.deepEqual(state(), empty);
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
  startPrefetch({ ...account, name: "bob" }, route);
  assert.equal(requests.length, 0);
  startPrefetch(account, {
    ...route,
    channelId: otherChannelId,
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].request.data.text_channel_id, otherTextId);
  assert.equal(requests[0].request.data.target_host, "peer.example");
  assert.deepEqual(state().messagesByTextChannelId, {});
  reply(requests[0], []);
});

test("speculative history stays hidden until metadata confirms it, retaining live edits", async () => {
  remember();
  startPrefetch(account, route);
  reply(requests[0], [hintedMessage]);
  await Promise.resolve();
  await Promise.resolve();
  const edited = {
    ...hintedMessage,
    body: "live edit",
    updated_at: "2026-11-10T12:01:00Z",
  };
  updates.handleRunelinkUpdate({ type: "message_upserted", data: edited });
  assert.deepEqual(state().messagesByTextChannelId, {});
  await fetchMessages(textId, "peer.example");
  assert.equal(requests.length, 1);
  assert.deepEqual(state().messagesByTextChannelId[textId], [edited]);
});

test("confirming metadata while speculation is pending shares the request", async () => {
  remember();
  startPrefetch(account, route);
  const selected = fetchMessages(textId, "peer.example");
  assert.equal(requests.length, 1);
  reply(requests[0], [hintedMessage]);
  await selected;
  assert.equal(state().hasFetchedByTextChannelId[textId], true);
});

for (const changedHost of [false, true]) {
  test(`a stale ${changedHost ? "host" : "text-channel ID"} is discarded and fresh metadata wins`, async () => {
    remember();
    startPrefetch(account, route);
    const correctId = changedHost ? textId : otherTextId;
    const correctHost = changedHost ? "new-peer.example" : "peer.example";
    const selected = fetchMessages(correctId, correctHost);
    assert.equal(requests.length, 2);
    reply(requests[0], [hintedMessage]);
    reply(requests[1], []);
    await selected;
    assert.deepEqual(state().messagesByTextChannelId, {
      [correctId]: [],
    });
    assert.equal(state().hasFetchedByTextChannelId[correctId], true);
  });
}

test("failed speculation falls back to an ordinary request", async () => {
  remember();
  startPrefetch(account, route);
  requests[0].reject(new Error("stale hint"));
  const selected = fetchMessages(textId, "peer.example");
  // Allow the failed speculative request to reach the fallback.
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests.length, 2);
  reply(requests[1], []);
  await selected;
  assert.equal(state().errorByTextChannelId[textId], null);
});

test("reset during speculation prevents a fallback request under the next account", async () => {
  remember();
  startPrefetch(account, route);
  const selected = fetchMessages(textId, "peer.example");
  messages.resetMessages();
  requests[0].reject(new Error("old account"));
  await selected;
  assert.equal(requests.length, 1);
  assert.deepEqual(state().messagesByTextChannelId, {});
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
  startPrefetch(account, route);
  startPrefetch(account, {
    ...route,
    channelId: otherChannelId,
  });
  assert.equal(requests.length, 0);
  startPrefetch({ ...account, name: "bob" }, route);
  assert.equal(requests.length, 1);
  reply(requests[0], []);
});

test("blocked or malformed storage falls back without disrupting normal loading", async () => {
  storage.set("runelink.demo.channel-navigation-hints", "{bad json");
  startPrefetch(account, route);
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
  const selected = fetchMessages(textId);
  reply(requests[0], []);
  await selected;
});

test("startup does not refetch a channel already cached or loading on reconnect", () => {
  remember();
  startPrefetch(account, route, { [textId]: [] });
  assert.equal(requests.length, 0);
});

test("a deletion closes its edit, with a notice only if another session deleted it", async (t) => {
  const composer = await server.ssrLoadModule(
    "/src/lib/message-composer-store.ts"
  );
  const notices = [];
  updates.setUpdateNotifier((notice) => notices.push(notice));
  t.after(() => {
    updates.setUpdateNotifier(() => {});
    registry.set(composer.messageComposerAtom, {});
  });
  const other = { ...message, id: "other" };
  registry.update(messages.messagesAtom, (state) => ({
    ...state,
    messagesByTextChannelId: { channel: [message, other] },
  }));
  const edit = (message) =>
    composer.updateComposer("channel-key", (state) => ({
      ...state,
      focusedInput: "edit",
      editing: {
        session: {},
        message,
        body: "draft",
        selection: null,
        isSaving: false,
        error: null,
      },
    }));
  const tombstone = (message) => ({
    ...message,
    deleted_at: "2026-11-10T12:01:00Z",
    updated_at: "2026-11-10T12:01:00Z",
  });

  // The host sends the deletion update before replying to this client.
  edit(message);
  const deleting = run(messages.deleteMessage("channel", message.id));
  updates.handleRunelinkUpdate({
    type: "message_upserted",
    data: tombstone(message),
  });
  assert.equal(composer.getComposer("channel-key").editing, null);
  assert.deepEqual(notices, []);
  requests[0].resolve({ type: "messages_delete", data: tombstone(message) });
  await deleting;

  edit(other);
  updates.handleRunelinkUpdate({
    type: "message_upserted",
    data: tombstone(other),
  });
  assert.equal(composer.getComposer("channel-key").editing, null);
  assert.equal(composer.getComposer("channel-key").focusedInput, "draft");
  assert.deepEqual(notices, ["The message you were editing was deleted."]);
});
