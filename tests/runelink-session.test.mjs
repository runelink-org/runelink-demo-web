import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Scope from "effect/Scope";
import * as Socket from "effect/socket/Socket";
import { createServer } from "vite";

let server;
let registry;
let authStore;
let session$;
let sockets;
// Whether new sockets never open, like a host that stops responding
let stalled;
// Requests written to the sockets, and the auth replies delivered, in order
let trace;
const originals = {
  fetch: globalThis.fetch,
  window: globalThis.window,
  document: globalThis.document,
};
const account = { name: "test", host: "localhost" };
const other = { name: "other", host: "localhost" };

// A host that accepts every offered capability and lets the test answer
// requests
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
  send(text) {
    const message = JSON.parse(text);
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
  reply(entry, reply) {
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
  receive(message) {
    const data = JSON.stringify(message);
    queueMicrotask(() =>
      this.dispatchEvent(Object.assign(new Event("message"), { data }))
    );
  }
  close(code = 1000, reason = "") {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.dispatchEvent(Object.assign(new Event("close"), { code, reason }));
  }
}

// Polls until `find` returns a value, and returns it
async function waitFor(find) {
  const deadline = Date.now() + 2_000;
  let found = find();
  while (!found && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    found = find();
  }
  assert.ok(found);
  return found;
}

const sentIndex = (type) =>
  trace.findIndex((entry) => entry.request?.request.type === type);

// Waits for the latest socket's unanswered request of `type`
const waitForRequest = (type) =>
  waitFor(() =>
    trace.find(
      (entry) =>
        entry.socket === sockets.at(-1) &&
        entry.request?.request.type === type &&
        !entry.answered
    )
  );

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, ws: false },
    appType: "custom",
    // Keep a running dev server's optimized dependencies intact.
    cacheDir: "node_modules/.vite-test",
  });
  ({ appAtomRegistry: registry } = await server.ssrLoadModule(
    "/src/lib/atom-registry.ts"
  ));
  authStore = await server.ssrLoadModule("/src/lib/auth-store.ts");
  session$ = await server.ssrLoadModule("/src/lib/runelink-session.ts");
});

after(async () => {
  Object.assign(globalThis, originals);
  await server?.close();
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
  globalThis.window = Object.assign(new EventTarget(), {
    location: { protocol: "https:" },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
  });
  globalThis.document = new EventTarget();
  globalThis.fetch = async () => new Response("", { status: 200 });
  registry.set(authStore.authAtom, {
    config: { active_account: account, accounts: [account, other] },
    authCache,
    authError: null,
  });
});

// A whole-test watchdog. Waits inside the tests are bounded more tightly.
const options = { timeout: 10_000 };

async function withSession(body) {
  const scope = Scope.makeUnsafe();
  try {
    const context = await Effect.runPromise(
      Layer.buildWithScope(session$.layer, scope).pipe(
        Effect.provide(
          Layer.succeed(Socket.WebSocketConstructor, () => new FakeSocket())
        )
      )
    );
    const session = Context.get(context, session$.RunelinkSession);
    // Requests and logins are interrupted when the session closes.
    const fork = (effect) =>
      Effect.runSync(Effect.forkIn(effect, scope, { startImmediately: true }));
    await body(
      (request) => fork(session.request(request)),
      (name) => fork(session.login({ host: "localhost", name, password: "pw" }))
    );
  } finally {
    await Effect.runPromise(Scope.close(scope, Exit.void));
  }
}

// Bounded, so a request that never settles fails the test and cleans up
const resultOf = (fiber) =>
  Effect.runPromise(Fiber.join(fiber).pipe(Effect.timeout("2 seconds")));

async function authenticate() {
  const auth = await waitForRequest("auth_token_access");
  auth.socket.reply(auth, {
    type: "auth_token_access",
    data: { type: "authenticated", data: { user_ref: account } },
  });
  await waitFor(
    () => registry.get(session$.connectionAtom).status === "connected"
  );
}

test(
  "a request made during a reconnect is sent once reauthenticated",
  options,
  async () => {
    await withSession(async (request) => {
      await authenticate();
      // Coming back online replaces the socket.
      window.dispatchEvent(new Event("online"));
      const ping = request({ type: "ping" });
      await authenticate();
      assert.equal(sockets.length, 2);

      const sent = await waitForRequest("ping");
      sent.socket.reply(sent, { type: "pong" });
      const authReplied = trace.findLastIndex(
        (entry) => entry.replied === "auth_token_access"
      );
      assert.ok(sentIndex("ping") > authReplied, "sent before authenticating");
      assert.equal((await resultOf(ping)).type, "pong");
    });
  }
);

test(
  "a waiting request fails if the account is switched",
  options,
  async () => {
    await withSession(async (request) => {
      await waitForRequest("auth_token_access");
      const ping = request({ type: "ping" });
      // Switching back does not revive the request.
      authStore.selectAccount(other);
      authStore.selectAccount(account);

      await assert.rejects(resultOf(ping), { _tag: "SessionChangedError" });
      await authenticate();
      assert.equal(sentIndex("ping"), -1);
    });
  }
);

test("a waiting request fails on logout", options, async () => {
  await withSession(async (request) => {
    await waitForRequest("auth_token_access");
    const ping = request({ type: "ping" });
    authStore.logoutActive();

    await assert.rejects(resultOf(ping), { _tag: "NotConnectedError" });
    assert.equal(sentIndex("ping"), -1);
  });
});

test(
  "switching accounts replaces a connection that never opens",
  options,
  async () => {
    stalled = true;
    await withSession(async () => {
      await waitFor(() => sockets.length === 1);
      stalled = false;
      authStore.selectAccount(other);

      const auth = await waitForRequest("auth_token_access");
      assert.equal(auth.request.request.data.access_token, "other");
      assert.equal(sockets[0].readyState, 3);
    });
  }
);

test("logging out stops a connection that never opens", options, async () => {
  stalled = true;
  await withSession(async () => {
    await waitFor(() => sockets.length === 1);
    authStore.logoutActive();

    await waitFor(
      () => registry.get(session$.connectionAtom).status === "disconnected"
    );
    assert.equal(sockets[0].readyState, 3);
  });
});

test("logging out cancels a login in progress", options, async () => {
  await withSession(async (_request, login) => {
    await authenticate();
    const attempt = login("new");
    await waitForRequest("auth_token_password");
    authStore.logoutActive();

    await assert.rejects(resultOf(attempt), {
      _tag: "RunelinkDisconnectedError",
    });
    assert.equal(registry.get(session$.connectionAtom).status, "disconnected");
  });
});

test(
  "background syncs keep a login's connection until it finishes",
  options,
  async () => {
    await withSession(async (request, login) => {
      await authenticate();
      const attempt = login("new");
      const sent = await waitForRequest("auth_token_password");
      // A request, and another tab refreshing the active account's tokens
      const ping = request({ type: "ping" });
      window.localStorage.setItem(
        "runelink.demo.auth-cache",
        JSON.stringify({
          accounts: { "test@localhost": { refresh_token: "rotated" } },
        })
      );
      window.dispatchEvent(Object.assign(new Event("storage"), { key: null }));

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
      await resultOf(attempt);
      assert.equal(sockets.length, 2);
      assert.equal(sockets[1].readyState, 1);
      // The request waited for the account the login replaced.
      await assert.rejects(resultOf(ping), { _tag: "SessionChangedError" });
      assert.equal(sentIndex("ping"), -1);
    });
  }
);
