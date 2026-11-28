import type * as MessagesStoreModule from "../src/lib/messages-store.ts";
import type * as AtomRegistryModule from "../src/lib/atom-registry.ts";
import type * as ChannelNavigationHintsModule from "../src/lib/channel-navigation-hints.ts";
import type * as RunelinkUpdatesModule from "../src/lib/runelink-updates.ts";
import type * as RunelinkSessionModule from "../src/lib/runelink-session.ts";
import assert from "node:assert/strict";
import { afterAll, beforeAll, beforeEach, it, vi } from "@effect/vitest";
import { RunelinkProtocolError, resourceKey } from "@runelink/sdk";
import type {
  ActiveMessage,
  Message,
  ResourceKey,
  UserRef,
} from "@runelink/sdk";
import type { AppRoute } from "../src/lib/app-route.ts";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { controlledSession } from "./session-fixture.ts";
import type { PendingRequest } from "./session-fixture.ts";

let messages: typeof MessagesStoreModule;
let registry: typeof AtomRegistryModule.appAtomRegistry;
let hints: typeof ChannelNavigationHintsModule;
let updates: typeof RunelinkUpdatesModule;
let session: RunelinkSessionModule.RunelinkSession["Service"];
let sessionTag: typeof RunelinkSessionModule.RunelinkSession;

let NotConnectedError: typeof RunelinkSessionModule.NotConnectedError;
const requests: PendingRequest[] = [];
const storage = new Map<string, string>();
const peer = "peer.example";
const message = {
  id: "message",
  host: peer,
  text_channel_id: "channel",
  author: null,
  edited_at: null,
  reply_to: null,
  body: "original",
  deleted_at: null,
  created_at: "2026-11-10T12:00:00Z",
  updated_at: "2026-11-10T12:00:00Z",
};

beforeAll(() =>
  Effect.gen(function* () {
    vi.stubGlobal("window", {
      location: { protocol: "http:" },
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });
    const session$ = yield* Effect.promise(
      () => import("../src/lib/runelink-session.ts")
    );
    sessionTag = session$.RunelinkSession;
    ({ NotConnectedError } = session$);
    // Requests wait until a test settles them.
    session = controlledSession(requests);
    ({ appAtomRegistry: registry } = yield* Effect.promise(
      () => import("../src/lib/atom-registry.ts")
    ));
    hints = yield* Effect.promise(
      () => import("../src/lib/channel-navigation-hints.ts")
    );
    updates = yield* Effect.promise(
      () => import("../src/lib/runelink-updates.ts")
    );
    messages = yield* Effect.promise(
      () => import("../src/lib/messages-store.ts")
    );
  })
);

function getMessageState() {
  return registry.get(messages.messagesAtom);
}

// The key of a text channel, on the peer host unless given
function textChannelKey(id: string, host = peer): ResourceKey {
  return resourceKey({ host, id });
}

function fetchMessages(id: string, host = peer) {
  return messages.fetchMessagesByTextChannel({ host, id });
}

function startPrefetch(
  account: UserRef,
  route: AppRoute,
  cachedMessages?: Record<ResourceKey, readonly Message[]>
) {
  return hints.startChannelNavigationPrefetch(account, route, cachedMessages);
}

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  messages.resetMessages();
  requests.length = 0;
  storage.clear();
});

function reply(
  request: PendingRequest,
  history: readonly Message[] = [message]
) {
  request.resolve({ type: "messages_get_by_text_channel", data: history });
}

const tombstone = (target: ActiveMessage) => ({
  ...target,
  body: null,
  deleted_at: "2026-11-10T12:01:00Z",
  updated_at: "2026-11-10T12:01:00Z",
});

it.effect(
  "prefetch and selection share an in-flight request and retain cached history",
  () =>
    Effect.gen(function* () {
      const prefetch = yield* Effect.forkScoped(fetchMessages("channel"), {
        startImmediately: true,
      });
      const selection = yield* Effect.forkScoped(fetchMessages("channel"), {
        startImmediately: true,
      });
      assert.equal(requests.length, 1);
      const [{ request }] = requests;
      assert.equal(request.type, "messages_get_by_text_channel");
      assert.deepEqual(request.data.text_channel, {
        host: peer,
        id: "channel",
      });
      reply(requests[0]);
      const prefetched = yield* Fiber.join(prefetch);
      assert.deepEqual(prefetched, [message]);
      const selected = yield* Fiber.join(selection);
      assert.deepEqual(selected, [message]);
      const cached = yield* fetchMessages("channel");
      assert.deepEqual(cached, [message]);
      assert.equal(requests.length, 1);
      assert.equal(
        getMessageState().isLoadingByTextChannelKey[textChannelKey("channel")],
        false
      );
    }).pipe(Effect.provideService(sessionTag, session))
);

it.effect("history preserves live edits received during a prefetch", () =>
  Effect.gen(function* () {
    const pending = yield* Effect.forkScoped(fetchMessages("channel"), {
      startImmediately: true,
    });
    assert.deepEqual(
      getMessageState().messagesByTextChannelKey[textChannelKey("channel")],
      []
    );
    const edited = {
      ...message,
      body: "edited",
      updated_at: "2026-11-10T12:01:00Z",
    };
    registry.update(messages.messagesAtom, (state) => ({
      ...state,
      messagesByTextChannelKey: { [textChannelKey("channel")]: [edited] },
    }));
    reply(requests[0]);
    yield* Fiber.join(pending);
    assert.deepEqual(
      getMessageState().messagesByTextChannelKey[textChannelKey("channel")],
      [edited]
    );
  }).pipe(Effect.provideService(sessionTag, session))
);

it.effect("a failed prefetch can retry when the channel opens", () =>
  Effect.gen(function* () {
    const pending = yield* Effect.forkScoped(fetchMessages("channel"), {
      startImmediately: true,
    });
    requests[0].reject(new NotConnectedError());
    assert.equal(
      (yield* pending.pipe(Fiber.join, Effect.flip))._tag,
      "NotConnectedError"
    );
    assert.equal(
      getMessageState().isLoadingByTextChannelKey[textChannelKey("channel")],
      false
    );
    assert.equal(
      getMessageState().errorByTextChannelKey[textChannelKey("channel")],
      "You're not connected. Try again once you're connected."
    );
    const retry = yield* Effect.forkScoped(fetchMessages("channel"), {
      startImmediately: true,
    });
    assert.equal(
      getMessageState().errorByTextChannelKey[textChannelKey("channel")],
      null
    );
    assert.equal(requests.length, 2);
    reply(requests[1]);
    yield* Fiber.join(retry);
    assert.equal(
      getMessageState().hasFetchedByTextChannelKey[textChannelKey("channel")],
      true
    );
  }).pipe(Effect.provideService(sessionTag, session))
);

it.effect.each(["history", "failure"])(
  "reset ignores an old account's late %s without disturbing a new fetch",
  (caseName) =>
    Effect.gen(function* () {
      const fails = caseName === "failure";
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
          (yield* old.pipe(Fiber.join, Effect.flip)).message,
          /old failure/u
        );
      } else {
        reply(requests[0]);
        yield* Fiber.join(old);
      }
      assert.deepEqual(
        getMessageState().messagesByTextChannelKey[textChannelKey("channel")],
        []
      );
      assert.equal(
        getMessageState().errorByTextChannelKey[textChannelKey("channel")],
        null
      );
      assert.equal(
        getMessageState().isLoadingByTextChannelKey[textChannelKey("channel")],
        true
      );
      const again = yield* Effect.forkScoped(fetchMessages("channel"), {
        startImmediately: true,
      });
      assert.equal(requests.length, 2);
      reply(requests[1], []);
      yield* Fiber.join(current);
      yield* Fiber.join(again);
      assert.deepEqual(
        getMessageState().messagesByTextChannelKey[textChannelKey("channel")],
        []
      );
      assert.equal(
        getMessageState().hasFetchedByTextChannelKey[textChannelKey("channel")],
        true
      );
    }).pipe(Effect.provideService(sessionTag, session))
);

it.effect.each(["history", "failure"])(
  "a late %s does not restore a removed channel",
  (caseName) =>
    Effect.gen(function* () {
      const fails = caseName === "failure";
      const empty = getMessageState();
      const pending = yield* Effect.forkScoped(fetchMessages("channel"), {
        startImmediately: true,
      });
      // Removed, such as by a deletion update
      registry.set(messages.messagesAtom, empty);
      if (fails) {
        requests[0].reject(new NotConnectedError());
        assert.equal(
          (yield* pending.pipe(Fiber.join, Effect.flip))._tag,
          "NotConnectedError"
        );
      } else {
        reply(requests[0]);
        yield* Fiber.join(pending);
      }
      assert.deepEqual(getMessageState(), empty);
    }).pipe(Effect.provideService(sessionTag, session))
);

const account = { name: "alice", host: "example.com" };
const serverId = "11111111-1111-4111-8111-111111111111";
const channelId = "22222222-2222-4222-8222-222222222222";
const textId = "33333333-3333-4333-8333-333333333333";
const otherChannelId = "44444444-4444-4444-8444-444444444444";
const otherTextId = "55555555-5555-4555-8555-555555555555";
const route = {
  screen: "channel",
  server: { host: peer, id: serverId },
  channelId,
} as const;
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
      host,
      server_id: serverId,
      position: 0,
      parent_channel_id: null,
    })),
  };
}
function remember(
  host = peer,
  channels: (
    | { id: string; kind: "text"; text_channel_id: string }
    | { id: string; kind: "category" }
  )[] = [
    { id: channelId, kind: "text", text_channel_id: textId },
    { id: otherChannelId, kind: "text", text_channel_id: otherTextId },
  ]
) {
  hints.rememberChannelNavigationHints(account, {
    [resourceKey({ host, id: serverId })]: serverSnapshot(host, channels),
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
      const [{ request }] = requests;
      assert.equal(request.type, "messages_get_by_text_channel");
      assert.deepEqual(request.data.text_channel, {
        host: peer,
        id: otherTextId,
      });
      assert.deepEqual(getMessageState().messagesByTextChannelKey, {});
      reply(requests[0], []);
    }).pipe(Effect.provideService(sessionTag, session))
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
      assert.deepEqual(getMessageState().messagesByTextChannelKey, {});
      yield* fetchMessages(textId);
      assert.equal(requests.length, 1);
      assert.deepEqual(
        getMessageState().messagesByTextChannelKey[textChannelKey(textId)],
        [edited]
      );
    }).pipe(Effect.provideService(sessionTag, session))
);

it.effect(
  "confirming metadata while speculation is pending shares the request",
  () =>
    Effect.gen(function* () {
      remember();
      yield* startPrefetch(account, route);
      const selected = yield* Effect.forkScoped(fetchMessages(textId), {
        startImmediately: true,
      });
      assert.equal(requests.length, 1);
      reply(requests[0], [hintedMessage]);
      yield* Fiber.join(selected);
      assert.equal(
        getMessageState().hasFetchedByTextChannelKey[textChannelKey(textId)],
        true
      );
    }).pipe(Effect.provideService(sessionTag, session))
);

it.effect.each(["text-channel ID", "host"])(
  "a stale %s is discarded and fresh metadata wins",
  (caseName) =>
    Effect.gen(function* () {
      const changedHost = caseName === "host";
      remember();
      yield* startPrefetch(account, route);
      const correctId = changedHost ? textId : otherTextId;
      const correctHost = changedHost ? "new-peer.example" : peer;
      const selected = yield* Effect.forkScoped(
        fetchMessages(correctId, correctHost),
        { startImmediately: true }
      );
      assert.equal(requests.length, 2);
      reply(requests[0], [hintedMessage]);
      reply(requests[1], []);
      yield* Fiber.join(selected);
      assert.deepEqual(getMessageState().messagesByTextChannelKey, {
        [textChannelKey(correctId, correctHost)]: [],
      });
      assert.equal(
        getMessageState().hasFetchedByTextChannelKey[
          textChannelKey(correctId, correctHost)
        ],
        true
      );
    }).pipe(Effect.provideService(sessionTag, session))
);
it.effect("failed speculation falls back to an ordinary request", () =>
  Effect.gen(function* () {
    remember();
    yield* startPrefetch(account, route);
    requests[0].reject(new RunelinkProtocolError({ reason: "stale hint" }));
    const selected = yield* Effect.forkScoped(fetchMessages(textId), {
      startImmediately: true,
    });
    // Allow the failed speculative request to reach the fallback.
    yield* Effect.yieldNow;
    assert.equal(requests.length, 2);
    reply(requests[1], []);
    yield* Fiber.join(selected);
    assert.equal(
      getMessageState().errorByTextChannelKey[textChannelKey(textId)],
      null
    );
  }).pipe(Effect.provideService(sessionTag, session))
);

it.effect(
  "reset during speculation prevents a fallback request under the next account",
  () =>
    Effect.gen(function* () {
      remember();
      yield* startPrefetch(account, route);
      const selected = yield* Effect.forkScoped(fetchMessages(textId), {
        startImmediately: true,
      });
      messages.resetMessages();
      requests[0].reject(new RunelinkProtocolError({ reason: "old account" }));
      yield* Fiber.join(selected);
      assert.equal(requests.length, 1);
      assert.deepEqual(getMessageState().messagesByTextChannelKey, {});
    }).pipe(Effect.provideService(sessionTag, session))
);

it.effect(
  "fresh snapshots remove deleted channel hints and categories, preserving other accounts",
  () =>
    Effect.gen(function* () {
      remember();
      hints.rememberChannelNavigationHints(
        { ...account, name: "bob" },
        {
          [resourceKey({ host: peer, id: serverId })]: serverSnapshot(peer, [
            { id: channelId, kind: "text", text_channel_id: textId },
          ]),
        }
      );
      remember(peer, [{ id: channelId, kind: "category" }]);
      yield* startPrefetch(account, route);
      yield* startPrefetch(account, {
        ...route,
        channelId: otherChannelId,
      });
      assert.equal(requests.length, 0);
      yield* startPrefetch({ ...account, name: "bob" }, route);
      assert.equal(requests.length, 1);
      reply(requests[0], []);
    }).pipe(Effect.provideService(sessionTag, session))
);

it.effect(
  "blocked or malformed storage falls back without disrupting normal loading",
  () =>
    Effect.gen(function* () {
      storage.set("runelink.demo.channel-navigation-hints.v2", "{bad json");
      yield* startPrefetch(account, route);
      assert.equal(requests.length, 0);
      const setItem = window.localStorage.setItem.bind(window.localStorage);
      window.localStorage.setItem = () => {
        throw new Error("quota");
      };
      yield* Effect.sync(() => {
        remember();
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            window.localStorage.setItem = setItem;
          })
        )
      );
      const selected = yield* Effect.forkScoped(fetchMessages(textId), {
        startImmediately: true,
      });
      reply(requests[0], []);
      yield* Fiber.join(selected);
    }).pipe(Effect.provideService(sessionTag, session))
);

it.effect(
  "startup does not refetch a channel already cached or loading on reconnect",
  () =>
    Effect.gen(function* () {
      remember();
      yield* startPrefetch(account, route, { [textChannelKey(textId)]: [] });
      assert.equal(requests.length, 0);
    }).pipe(Effect.provideService(sessionTag, session))
);

it.effect(
  "a deletion closes its edit, with a notice only if another session deleted it",
  (t) =>
    Effect.gen(function* () {
      const composer = yield* Effect.promise(
        () => import("../src/lib/message-composer-store.ts")
      );
      const notices: string[] = [];
      updates.setUpdateNotifier((notice) => {
        notices.push(notice);
      });
      t.onTestFinished(() => {
        updates.setUpdateNotifier(undefined);
        registry.set(composer.messageComposerAtom, {});
      });
      const other = { ...message, id: "other" };
      registry.update(messages.messagesAtom, (state) => ({
        ...state,
        messagesByTextChannelKey: {
          [textChannelKey("channel")]: [message, other],
        },
      }));
      const channelKey = textChannelKey("server-channel");
      const edit = (target: ActiveMessage) => {
        composer.updateComposer(channelKey, (currentComposer) => ({
          ...currentComposer,
          focusedInput: "edit",
          editing: {
            session: {},
            message: target,
            body: "draft",
            selection: null,
            isSaving: false,
            error: null,
          },
        }));
      };
      // The host sends the deletion update before replying to this client.
      edit(message);
      const deleting = yield* Effect.forkScoped(
        messages.deleteMessage(message),
        { startImmediately: true }
      );
      updates.handleRunelinkUpdate({
        type: "message_upserted",
        data: tombstone(message),
      });
      assert.equal(composer.getComposer(channelKey).editing, null);
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
      assert.equal(composer.getComposer(channelKey).editing, null);
      assert.equal(composer.getComposer(channelKey).focusedInput, "draft");
      assert.deepEqual(notices, ["The message you were editing was deleted."]);
    }).pipe(Effect.provideService(sessionTag, session))
);
