import * as fixtures from "./fixtures.ts";
import type * as AtomRegistryModule from "../src/lib/atom-registry.ts";
import type * as AuthStoreModule from "../src/lib/auth-store.ts";
import type * as RunelinkSessionModule from "../src/lib/runelink-session.ts";
import type * as SdkModule from "@runelink/sdk";
import assert from "node:assert/strict";
import { afterAll, beforeAll, beforeEach, it, vi } from "@effect/vitest";
import * as Context from "effect/Context";
import type * as RunelinkUpdatesModule from "../src/lib/runelink-updates.ts";
import * as Effect from "effect/Effect";
import * as FiberSet from "effect/FiberSet";
import type { RequestFailure } from "../src/lib/runelink-session.ts";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { WsEnvelopeSchema } from "@runelink/sdk";
import * as Socket from "effect/socket/Socket";

let registry: typeof AtomRegistryModule.appAtomRegistry;
let authStore: typeof AuthStoreModule;
let session$: typeof RunelinkSessionModule;
let handleRunelinkUpdate: typeof RunelinkUpdatesModule.handleRunelinkUpdate;
let sockets: FakeSocket[];
// Whether new sockets never open, like a host that stops responding
let stalled: boolean;
// Requests written to the sockets, and the auth replies delivered, in order
type Sent = {
  socket: FakeSocket;
  request: SdkModule.WsRequestEnvelope["data"];
  answered?: boolean;
};
type TraceEntry = Sent | { socket: FakeSocket; replied: string };
let trace: TraceEntry[];
function isSent(entry: TraceEntry): entry is Sent {
  return "request" in entry;
}
const originals = {
  fetch: globalThis.fetch,
  window: globalThis.window,
  document: globalThis.document,
};
const account = fixtures.userRef({ name: "test", host: "localhost" });
const other = fixtures.userRef({ name: "other", host: "localhost" });

// A host that accepts every offered capability and lets the test answer
// requests
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const decodeEnvelope = Schema.decodeUnknownSync(
  Schema.fromJsonString(WsEnvelopeSchema)
);
class FakeSocket extends EventTarget {
  readyState = 0;
  constructor() {
    super();
    sockets.push(this);
    if (stalled) return;
    queueMicrotask(() => {
      this.readyState = 1;
      this.dispatchEvent(new Event("open"));
    });
  }
  send(text: string | Uint8Array<ArrayBuffer>) {
    const raw =
      typeof text === "string" ? text : new TextDecoder().decode(text);
    const message = decodeEnvelope(raw);
    if (message.type === "request") {
      trace.push({ socket: this, request: message.data });
      return;
    }
    if (message.type !== "hello") return;
    const capabilities = Object.fromEntries(
      Object.entries(message.data.capabilities).map(([id, versions]) => [
        id,
        versions[0],
      ])
    );
    this.receive({
      type: "welcome",
      data: { negotiation_version: 1, server_version: "test", capabilities },
    });
  }
  reply(entry: Sent, reply: object) {
    const { request } = entry;
    entry.answered = true;
    const data = JSON.stringify({
      type: "reply",
      data: {
        request_id: request.request_id,
        event_id: request.request_id,
        reply,
      },
    });
    queueMicrotask(() => {
      trace.push({ socket: this, replied: request.request.type });
      this.dispatchEvent(Object.assign(new Event("message"), { data }));
    });
  }
  receive(message: object) {
    const data = JSON.stringify(message);
    queueMicrotask(() => {
      this.dispatchEvent(Object.assign(new Event("message"), { data }));
    });
  }
  close(code = 1000, reason = "") {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.dispatchEvent(Object.assign(new Event("close"), { code, reason }));
  }
}

// Yields to the socket and session fibers without advancing the test clock.
const waitFor = Effect.fn("SessionTest.waitFor")(function* <
  A extends object | boolean | null | undefined,
>(find: () => A) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const found = find();
    if (found != null && found !== false) return found;
    yield* Effect.yieldNow;
  }
  return assert.fail(
    `Expected session work to settle (status: ${registry.get(session$.connectionAtom).status}, requests: ${trace.map((entry) => (isSent(entry) ? entry.request.request.type : undefined)).join(",")})`
  );
});

const sentIndex = (type: string) =>
  trace.findIndex(
    (entry) => isSent(entry) && entry.request.request.type === type
  );

// Waits for the latest socket's unanswered request of `type`
const waitForRequest = (type: string) =>
  waitFor(() =>
    trace.find(
      (entry): entry is Sent =>
        entry.socket === sockets.at(-1) &&
        isSent(entry) &&
        entry.request.request.type === type &&
        !entry.answered
    )
  );

beforeAll(() =>
  Effect.gen(function* () {
    ({ appAtomRegistry: registry } = yield* Effect.promise(
      () => import("../src/lib/atom-registry.ts")
    ));
    authStore = yield* Effect.promise(() => import("../src/lib/auth-store.ts"));
    session$ = yield* Effect.promise(
      () => import("../src/lib/runelink-session.ts")
    );
    ({ handleRunelinkUpdate } = yield* Effect.promise(
      () => import("../src/lib/runelink-updates.ts")
    ));
  })
);

afterAll(() => {
  Object.assign(globalThis, originals);
});

beforeEach(() => {
  sockets = [];
  trace = [];
  stalled = false;
  const authCache = {
    accounts: {
      "test@localhost": { refresh_token: "test", access_token: "test" },
      "other@localhost": { refresh_token: "other", access_token: "other" },
    },
  };
  // The session reloads the stored tokens when it starts.
  const storage = new Map([
    ["runelink.demo.auth-cache", JSON.stringify(authCache)],
  ]);
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), {
      location: { protocol: "https:" },
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    })
  );
  vi.stubGlobal("document", new EventTarget());
  globalThis.fetch = () => Promise.resolve(new Response("", { status: 200 }));
  registry.set(authStore.authAtom, {
    config: { active_account: account, accounts: [account, other] },
    authCache,
    authError: null,
  });
});

// A whole-test watchdog. Waits inside the tests are bounded more tightly.
const options = { timeout: 10_000 };

function withSession<A, E, R>(
  body: (
    session: (typeof RunelinkSessionModule)["RunelinkSession"]["Service"]
  ) => Effect.Effect<A, E, R>
) {
  return Effect.flatMap(
    Layer.build(session$.layer(handleRunelinkUpdate)).pipe(
      Effect.provideService(Socket.WebSocketConstructor, () => new FakeSocket())
    ),
    (context) => body(Context.get(context, session$.RunelinkSession))
  );
}

const authenticate = Effect.fn("SessionTest.authenticate")(function* () {
  const auth = yield* waitForRequest("auth_token_access");
  auth.socket.reply(auth, {
    type: "auth_token_access",
    data: { type: "authenticated", data: { user_ref: account } },
  });
  yield* waitFor(
    () => registry.get(session$.connectionAtom).status === "connected"
  );
});

it.effect(
  "a request made during a reconnect is sent once reauthenticated",
  () =>
    withSession((session) =>
      Effect.gen(function* () {
        yield* authenticate();
        // Coming back online replaces the socket.
        window.dispatchEvent(new Event("online"));
        const ping = yield* Effect.forkScoped(
          session.request({ type: "ping" }),
          { startImmediately: true }
        );
        yield* authenticate();
        assert.equal(sockets.length, 2);

        const sent = yield* waitForRequest("ping");
        sent.socket.reply(sent, { type: "pong" });
        const authReplied = trace.findLastIndex(
          (entry) => "replied" in entry && entry.replied === "auth_token_access"
        );
        assert.ok(
          sentIndex("ping") > authReplied,
          "sent before authenticating"
        );
        assert.equal((yield* Fiber.join(ping)).type, "pong");
      })
    ),
  options
);

it.effect(
  "a waiting request fails if the account is switched",
  () =>
    withSession((session) =>
      Effect.gen(function* () {
        yield* waitForRequest("auth_token_access");
        const ping = yield* Effect.forkScoped(
          session.request({ type: "ping" }),
          {
            startImmediately: true,
          }
        );
        const previousSocket = sockets.at(-1);
        // Switching back does not revive the request.
        authStore.selectAccount(other);
        authStore.selectAccount(account);

        assert.equal(
          (yield* ping.pipe(Fiber.join, Effect.flip))._tag,
          "SessionChangedError"
        );
        yield* waitFor(() => sockets.at(-1) !== previousSocket);
        yield* authenticate();
        assert.equal(sentIndex("ping"), -1);
      })
    ),
  options
);

it.effect(
  "a waiting request fails on logout",
  () =>
    withSession((session) =>
      Effect.gen(function* () {
        yield* waitForRequest("auth_token_access");
        const ping = yield* Effect.forkScoped(
          session.request({ type: "ping" }),
          {
            startImmediately: true,
          }
        );
        authStore.logoutActive();

        assert.equal(
          (yield* ping.pipe(Fiber.join, Effect.flip))._tag,
          "NotConnectedError"
        );
        assert.equal(sentIndex("ping"), -1);
      })
    ),
  options
);

it.effect(
  "switching accounts replaces a connection that never opens",
  () => {
    stalled = true;
    return withSession(() =>
      Effect.gen(function* () {
        yield* waitFor(() => sockets.length === 1);
        stalled = false;
        authStore.selectAccount(other);

        const auth = yield* waitForRequest("auth_token_access");
        const { request } = auth.request;
        assert.equal(request.type, "auth_token_access");
        assert.equal(request.data.access_token, "other");
        assert.equal(sockets[0].readyState, 3);
      })
    );
  },
  options
);

it.effect(
  "logging out stops a connection that never opens",
  () => {
    stalled = true;
    return withSession(() =>
      Effect.gen(function* () {
        yield* waitFor(() => sockets.length === 1);
        authStore.logoutActive();

        yield* waitFor(
          () => registry.get(session$.connectionAtom).status === "disconnected"
        );
        assert.equal(sockets[0].readyState, 3);
      })
    );
  },
  options
);

it.effect(
  "logging out cancels a login in progress",
  () =>
    withSession((session) =>
      Effect.gen(function* () {
        yield* authenticate();
        const attempt = yield* Effect.forkScoped(
          session.login({ host: "localhost", name: "new", password: "pw" }),
          { startImmediately: true }
        );
        yield* waitForRequest("auth_token_password");
        authStore.logoutActive();

        assert.equal(
          (yield* attempt.pipe(Fiber.join, Effect.flip))._tag,
          "RunelinkDisconnectedError"
        );
        assert.equal(
          registry.get(session$.connectionAtom).status,
          "disconnected"
        );
      })
    ),
  options
);

it.effect(
  "background syncs keep a login's connection until it finishes",
  () =>
    withSession((session) =>
      Effect.gen(function* () {
        yield* authenticate();
        const attempt = yield* Effect.forkScoped(
          session.login({ host: "localhost", name: "new", password: "pw" }),
          { startImmediately: true }
        );
        const sent = yield* waitForRequest("auth_token_password");
        // A request, and another tab refreshing the active account's tokens
        const ping = yield* Effect.forkScoped(
          session.request({ type: "ping" }),
          { startImmediately: true }
        );
        window.localStorage.setItem(
          "runelink.demo.auth-cache",
          encodeJson({
            accounts: { "test@localhost": { refresh_token: "rotated" } },
          })
        );
        window.dispatchEvent(
          Object.assign(new Event("storage"), { key: null })
        );

        sent.socket.reply(sent, {
          type: "auth_token",
          data: {
            access_token: "new",
            token_type: "Bearer",
            expires_in: 3600,
            refresh_token: "new",
            scope: "openid",
          },
        });
        yield* Fiber.join(attempt);
        assert.equal(sockets.length, 2);
        assert.equal(sockets[1].readyState, 1);
        // The request waited for the account the login replaced.
        assert.equal(
          (yield* ping.pipe(Fiber.join, Effect.flip))._tag,
          "SessionChangedError"
        );
        assert.equal(sentIndex("ping"), -1);
      })
    ),
  options
);

it.effect(
  "a request fails if the socket drops before the session sees it",
  () =>
    withSession((session) =>
      Effect.gen(function* () {
        yield* authenticate();
        // The SDK reports the close before its status changes, so the session
        // still looks connected.
        const fork = yield* FiberSet.makeRuntime<
          never,
          { readonly type: "pong" },
          RequestFailure
        >();
        let ping:
          Fiber.Fiber<{ readonly type: "pong" }, RequestFailure> | undefined;
        const unsubscribe = registry.subscribe(
          session$.connectionAtom,
          (state) => {
            if (state.lastError == null || state.lastError === "") return;
            unsubscribe();
            ping = fork(session.request({ type: "ping" }));
          }
        );
        sockets[0].close(4000);

        const pending = yield* waitFor(() => ping);
        assert.equal(
          (yield* pending.pipe(Fiber.join, Effect.flip))._tag,
          "RunelinkDisconnectedError"
        );
        assert.equal(sentIndex("ping"), -1);
      })
    ),
  options
);
