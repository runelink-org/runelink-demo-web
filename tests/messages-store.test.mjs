import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { createServer } from "vite";

let server;
let store;
let requests;
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
    localStorage: { getItem: () => null, setItem() {} },
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
