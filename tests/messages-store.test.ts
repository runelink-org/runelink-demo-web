import assert from "node:assert/strict";
import { afterAll, beforeAll, beforeEach, it, vi } from "@effect/vitest";
import { RunelinkProtocolError } from "@runelink/sdk";
import type { ActiveMessage, Message, UserRef } from "@runelink/sdk";
import type { AppRoute } from "../src/lib/app-route.ts";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import { controlledSession } from "./session-fixture.ts";
import type { PendingRequest } from "./session-fixture.ts";

let messages: typeof import("../src/lib/messages-store.ts");
let registry: typeof import("../src/lib/atom-registry.ts").appAtomRegistry;
let hints: typeof import("../src/lib/channel-navigation-hints.ts");
let updates: typeof import("../src/lib/runelink-updates.ts");
let session: Layer.Layer<RunelinkSession>;
import type { RunelinkSession } from "../src/lib/runelink-session.ts";

let NotConnectedError: typeof import("../src/lib/runelink-session.ts").NotConnectedError;
const requests: PendingRequest[] = [];
const storage = new Map<string, string>();
const originalWindow = globalThis.window;
const message = {
  id: "message",
  text_channel_id: "channel",
  author: null,
  edited_at: null,
  reply_to: null,
  body: "original",
  deleted_at: null,
  created_at: "2026-11-10T12:00:00Z",
  updated_at: "2026-11-10T12:00:00Z",
};

beforeAll(async () => {
  vi.stubGlobal("window", {
    location: { protocol: "http:" },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  const session$ = await import("../src/lib/runelink-session.ts");
  const { RunelinkSession } = session$;
  ({ NotConnectedError } = session$);
  // Requests wait until a test settles them.
  session = Layer.succeed(RunelinkSession, controlledSession(requests));
  ({ appAtomRegistry: registry } = await import("../src/lib/atom-registry.ts"));
  hints = await import("../src/lib/channel-navigation-hints.ts");
  updates = await import("../src/lib/runelink-updates.ts");
  messages = await import("../src/lib/messages-store.ts");
});

function state() {
  return registry.get(messages.messagesAtom);
}

function fetchMessages(textChannelId: string, targetHost?: string) {
  return messages.fetchMessagesByTextChannel(textChannelId, targetHost);
}

function startPrefetch(
  account: UserRef,
  route: AppRoute,
  cachedMessages?: Record<string, readonly Message[]>
) {
  return hints.startChannelNavigationPrefetch(account, route, cachedMessages);
}

afterAll(() => {
  globalThis.window = originalWindow;
});

beforeEach(() => {
  messages.resetMessages();
  requests.length = 0;
  storage.clear();
});

function reply(
  request: PendingRequest,
  messages: readonly Message[] = [message]
) {
  request.resolve({ type: "messages_get_by_text_channel", data: messages });
}

it.effect(
  "prefetch and selection share an in-flight request and retain cached history",
  () =>
    Effect.gen(function* () {
      const prefetch = yield* Effect.forkScoped(
        fetchMessages("channel", "peer.example"),
        { startImmediately: true }
      );
      const selection = yield* Effect.forkScoped(
        fetchMessages("channel", "peer.example"),
        { startImmediately: true }
      );
      assert.equal(requests.length, 1);
      const sent = requests[0].request;
      assert.ok("data" in sent && "target_host" in sent.data);
      assert.equal(sent.data.target_host, "peer.example");
      reply(requests[0]);
      assert.deepEqual(yield* Fiber.join(prefetch), [message]);
      assert.deepEqual(yield* Fiber.join(selection), [message]);
      assert.deepEqual(yield* fetchMessages("channel"), [message]);
      assert.equal(requests.length, 1);
      assert.equal(state().isLoadingByTextChannelId.channel, false);
    }).pipe(Effect.provide(session))
);

it.effect("history preserves live edits received during a prefetch", () =>
  Effect.gen(function* () {
    const pending = yield* Effect.forkScoped(fetchMessages("channel"), {
      startImmediately: true,
    });
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
    yield* Fiber.join(pending);
    assert.deepEqual(state().messagesByTextChannelId.channel, [edited]);
  }).pipe(Effect.provide(session))
);

it.effect("a failed prefetch can retry when the channel opens", () =>
  Effect.gen(function* () {
    const pending = yield* Effect.forkScoped(fetchMessages("channel"), {
      startImmediately: true,
    });
    requests[0].reject(new NotConnectedError());
    assert.equal(
      (yield* Effect.flip(Fiber.join(pending)))._tag,
      "NotConnectedError"
    );
    assert.equal(state().isLoadingByTextChannelId.channel, false);
    assert.equal(
      state().errorByTextChannelId.channel,
      "You're not connected. Try again once you're connected."
    );
    const retry = yield* Effect.forkScoped(fetchMessages("channel"), {
      startImmediately: true,
    });
    assert.equal(state().errorByTextChannelId.channel, null);
    assert.equal(requests.length, 2);
    reply(requests[1]);
    yield* Fiber.join(retry);
    assert.equal(state().hasFetchedByTextChannelId.channel, true);
  }).pipe(Effect.provide(session))
);

for (const fails of [false, true]) {
  it.effect(
    `reset ignores an old account's late ${fails ? "failure" : "history"} without disturbing a new fetch`,
    () =>
      Effect.gen(function* () {
        const old = yield* Effect.forkScoped(fetchMessages("channel"), {
          startImmediately: true,
        });
        messages.resetMessages();
        const current = yield* Effect.forkScoped(fetchMessages("channel"), {
          startImmediately: true,
        });
        if (fails) {
          requests[0].reject(
            new RunelinkProtocolError({ reason: "old failure" })
          );
          assert.match(
            (yield* Effect.flip(Fiber.join(old))).message,
            /old failure/
          );
        } else {
          reply(requests[0]);
          yield* Fiber.join(old);
        }
        assert.deepEqual(state().messagesByTextChannelId.channel, []);
        assert.equal(state().errorByTextChannelId.channel, null);
        assert.equal(state().isLoadingByTextChannelId.channel, true);
        const again = yield* Effect.forkScoped(fetchMessages("channel"), {
          startImmediately: true,
        });
        assert.equal(requests.length, 2);
        reply(requests[1], []);
        yield* Fiber.join(current);
        yield* Fiber.join(again);
        assert.deepEqual(state().messagesByTextChannelId.channel, []);
        assert.equal(state().hasFetchedByTextChannelId.channel, true);
      }).pipe(Effect.provide(session))
  );
}

for (const fails of [false, true]) {
  it.effect(
    `a late ${fails ? "failure" : "history"} does not restore a removed channel`,
    () =>
      Effect.gen(function* () {
        const empty = state();
        const pending = yield* Effect.forkScoped(fetchMessages("channel"), {
          startImmediately: true,
        });
        // Removed, such as by a deletion update
        registry.set(messages.messagesAtom, empty);
        if (fails) {
          requests[0].reject(new NotConnectedError());
          assert.equal(
            (yield* Effect.flip(Fiber.join(pending)))._tag,
            "NotConnectedError"
          );
        } else {
          reply(requests[0]);
          yield* Fiber.join(pending);
        }
        assert.deepEqual(state(), empty);
      }).pipe(Effect.provide(session))
  );
}

const account = { name: "alice", host: "example.com" };
const serverId = "11111111-1111-4111-8111-111111111111";
const channelId = "22222222-2222-4222-8222-222222222222";
const textId = "33333333-3333-4333-8333-333333333333";
const otherChannelId = "44444444-4444-4444-8444-444444444444";
const otherTextId = "55555555-5555-4555-8555-555555555555";
const route = { screen: "channel", serverId, channelId } as const;
const hintedMessage = { ...message, text_channel_id: textId };
function serverSnapshot(
  host: string,
  channels: readonly (
    | { id: string; kind: "text"; text_channel_id: string }
    | { id: string; kind: "category" }
  )[]
) {
  const fields = {
    title: "Test",
    description: null,
    created_at: message.created_at,
    updated_at: message.updated_at,
  };
  return {
    server: { ...fields, id: serverId, host },
    channels: channels.map((channel) => ({
      ...fields,
      ...channel,
      server_id: serverId,
      position: 0,
      parent_channel_id: null,
    })),
  };
}
function remember(
  host = "peer.example",
  channels: (
    | { id: string; kind: "text"; text_channel_id: string }
    | { id: string; kind: "category" }
  )[] = [
    { id: channelId, kind: "text", text_channel_id: textId },
    { id: otherChannelId, kind: "text", text_channel_id: otherTextId },
  ]
) {
  hints.rememberChannelNavigationHints(account, {
    [serverId]: serverSnapshot(host, channels),
  });
}

it.effect(
  "all known channel mappings can start a request in a new tab, scoped by account",
  () =>
    Effect.gen(function* () {
      remember();
      yield* startPrefetch({ ...account, name: "bob" }, route);
      assert.equal(requests.length, 0);
      yield* startPrefetch(account, {
        ...route,
        channelId: otherChannelId,
      });
      assert.equal(requests.length, 1);
      const { request } = requests[0];
      assert.equal(request.type, "messages_get_by_text_channel");
      assert.equal(request.data.text_channel_id, otherTextId);
      const sent = requests[0].request;
      assert.ok("data" in sent && "target_host" in sent.data);
      assert.equal(sent.data.target_host, "peer.example");
      assert.deepEqual(state().messagesByTextChannelId, {});
      reply(requests[0], []);
    }).pipe(Effect.provide(session))
);

it.effect(
  "speculative history stays hidden until metadata confirms it, retaining live edits",
  () =>
    Effect.gen(function* () {
      remember();
      yield* startPrefetch(account, route);
      reply(requests[0], [hintedMessage]);
      yield* Effect.yieldNow;
      yield* Effect.yieldNow;
      const edited = {
        ...hintedMessage,
        body: "live edit",
        updated_at: "2026-11-10T12:01:00Z",
      };
      updates.handleRunelinkUpdate({ type: "message_upserted", data: edited });
      assert.deepEqual(state().messagesByTextChannelId, {});
      yield* fetchMessages(textId, "peer.example");
      assert.equal(requests.length, 1);
      assert.deepEqual(state().messagesByTextChannelId[textId], [edited]);
    }).pipe(Effect.provide(session))
);

it.effect(
  "confirming metadata while speculation is pending shares the request",
  () =>
    Effect.gen(function* () {
      remember();
      yield* startPrefetch(account, route);
      const selected = yield* Effect.forkScoped(
        fetchMessages(textId, "peer.example"),
        { startImmediately: true }
      );
      assert.equal(requests.length, 1);
      reply(requests[0], [hintedMessage]);
      yield* Fiber.join(selected);
      assert.equal(state().hasFetchedByTextChannelId[textId], true);
    }).pipe(Effect.provide(session))
);

for (const changedHost of [false, true]) {
  it.effect(
    `a stale ${changedHost ? "host" : "text-channel ID"} is discarded and fresh metadata wins`,
    () =>
      Effect.gen(function* () {
        remember();
        yield* startPrefetch(account, route);
        const correctId = changedHost ? textId : otherTextId;
        const correctHost = changedHost ? "new-peer.example" : "peer.example";
        const selected = yield* Effect.forkScoped(
          fetchMessages(correctId, correctHost),
          { startImmediately: true }
        );
        assert.equal(requests.length, 2);
        reply(requests[0], [hintedMessage]);
        reply(requests[1], []);
        yield* Fiber.join(selected);
        assert.deepEqual(state().messagesByTextChannelId, {
          [correctId]: [],
        });
        assert.equal(state().hasFetchedByTextChannelId[correctId], true);
      }).pipe(Effect.provide(session))
  );
}

it.effect("failed speculation falls back to an ordinary request", () =>
  Effect.gen(function* () {
    remember();
    yield* startPrefetch(account, route);
    requests[0].reject(new RunelinkProtocolError({ reason: "stale hint" }));
    const selected = yield* Effect.forkScoped(
      fetchMessages(textId, "peer.example"),
      { startImmediately: true }
    );
    // Allow the failed speculative request to reach the fallback.
    yield* Effect.yieldNow;
    assert.equal(requests.length, 2);
    reply(requests[1], []);
    yield* Fiber.join(selected);
    assert.equal(state().errorByTextChannelId[textId], null);
  }).pipe(Effect.provide(session))
);

it.effect(
  "reset during speculation prevents a fallback request under the next account",
  () =>
    Effect.gen(function* () {
      remember();
      yield* startPrefetch(account, route);
      const selected = yield* Effect.forkScoped(
        fetchMessages(textId, "peer.example"),
        { startImmediately: true }
      );
      messages.resetMessages();
      requests[0].reject(new RunelinkProtocolError({ reason: "old account" }));
      yield* Fiber.join(selected);
      assert.equal(requests.length, 1);
      assert.deepEqual(state().messagesByTextChannelId, {});
    }).pipe(Effect.provide(session))
);

it.effect(
  "fresh snapshots remove deleted channel hints and categories, preserving other accounts",
  () =>
    Effect.gen(function* () {
      remember();
      hints.rememberChannelNavigationHints(
        { ...account, name: "bob" },
        {
          [serverId]: serverSnapshot("peer.example", [
            { id: channelId, kind: "text", text_channel_id: textId },
          ]),
        }
      );
      remember("peer.example", [{ id: channelId, kind: "category" }]);
      yield* startPrefetch(account, route);
      yield* startPrefetch(account, {
        ...route,
        channelId: otherChannelId,
      });
      assert.equal(requests.length, 0);
      yield* startPrefetch({ ...account, name: "bob" }, route);
      assert.equal(requests.length, 1);
      reply(requests[0], []);
    }).pipe(Effect.provide(session))
);

it.effect(
  "blocked or malformed storage falls back without disrupting normal loading",
  () =>
    Effect.gen(function* () {
      storage.set("runelink.demo.channel-navigation-hints", "{bad json");
      yield* startPrefetch(account, route);
      assert.equal(requests.length, 0);
      const { setItem } = window.localStorage;
      window.localStorage.setItem = () => {
        throw new Error("quota");
      };
      try {
        remember();
      } finally {
        window.localStorage.setItem = setItem;
      }
      const selected = yield* Effect.forkScoped(fetchMessages(textId), {
        startImmediately: true,
      });
      reply(requests[0], []);
      yield* Fiber.join(selected);
    }).pipe(Effect.provide(session))
);

it.effect(
  "startup does not refetch a channel already cached or loading on reconnect",
  () =>
    Effect.gen(function* () {
      remember();
      yield* startPrefetch(account, route, { [textId]: [] });
      assert.equal(requests.length, 0);
    }).pipe(Effect.provide(session))
);

it.effect(
  "a deletion closes its edit, with a notice only if another session deleted it",
  (t) =>
    Effect.gen(function* () {
      const composer = yield* Effect.promise(
        () => import("../src/lib/message-composer-store.ts")
      );
      const notices: string[] = [];
      updates.setUpdateNotifier((notice) => notices.push(notice));
      t.onTestFinished(() => {
        updates.setUpdateNotifier(() => {});
        registry.set(composer.messageComposerAtom, {});
      });
      const other = { ...message, id: "other" };
      registry.update(messages.messagesAtom, (state) => ({
        ...state,
        messagesByTextChannelId: { channel: [message, other] },
      }));
      const edit = (message: ActiveMessage) => {
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
      };
      const tombstone = (message: ActiveMessage) => ({
        ...message,
        body: null,
        deleted_at: "2026-11-10T12:01:00Z",
        updated_at: "2026-11-10T12:01:00Z",
      });

      // The host sends the deletion update before replying to this client.
      edit(message);
      const deleting = yield* Effect.forkScoped(
        messages.deleteMessage("channel", message.id),
        { startImmediately: true }
      );
      updates.handleRunelinkUpdate({
        type: "message_upserted",
        data: tombstone(message),
      });
      assert.equal(composer.getComposer("channel-key").editing, null);
      assert.deepEqual(notices, []);
      requests[0].resolve({
        type: "messages_delete",
        data: tombstone(message),
      });
      yield* Fiber.join(deleting);

      edit(other);
      updates.handleRunelinkUpdate({
        type: "message_upserted",
        data: tombstone(other),
      });
      assert.equal(composer.getComposer("channel-key").editing, null);
      assert.equal(composer.getComposer("channel-key").focusedInput, "draft");
      assert.deepEqual(notices, ["The message you were editing was deleted."]);
    }).pipe(Effect.provide(session))
);
