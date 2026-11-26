import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Scope from "effect/Scope";
import * as Socket from "effect/socket/Socket";
import { createServer } from "vite";

let server;
let hostTransport;
let registry;
let storage;
let calls;
const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true },
    appType: "custom",
    // Keep a running dev server's optimized dependencies intact.
    cacheDir: "node_modules/.vite-test",
  });
  hostTransport = await server.ssrLoadModule("/src/lib/host-transport.ts");
  ({ appAtomRegistry: registry } = await server.ssrLoadModule(
    "/src/lib/atom-registry.ts"
  ));
});

after(async () => {
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
  await server?.close();
});

function resolveHostTransport(host, signal) {
  return Effect.runPromise(hostTransport.resolveHostTransport(host), {
    signal,
  });
}

function getPrompt() {
  return registry.get(hostTransport.hostTransportPromptAtom);
}

function setup({ stored = {}, protocol = "http:", secureResponse } = {}) {
  storage = new Map([
    ["runelink.demo.host-transports", JSON.stringify(stored)],
  ]);
  calls = [];
  globalThis.window = {
    location: { protocol },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
  };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.startsWith("https:")) {
      if (secureResponse) return secureResponse;
      throw new TypeError("TLS failed");
    }
    return new Response("pong");
  };
}

async function waitForPrompt() {
  for (let attempt = 0; attempt < 20; attempt++) {
    const prompt = getPrompt();
    if (prompt) return prompt;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Expected transport approval prompt");
}

test("HTTP requires approval, remembers it across default-port aliases, and separates ports", async () => {
  setup();
  const controller = new AbortController();
  const pending = resolveHostTransport("localhost", controller.signal);
  const prompt = await waitForPrompt();
  assert.equal(prompt.host, "localhost:7000");
  assert.deepEqual(
    JSON.parse(storage.get("runelink.demo.host-transports")),
    {}
  );
  for (const { options } of calls) {
    assert.equal(options.credentials, "omit");
    assert.equal(options.redirect, "manual");
  }
  prompt.respond(true);
  assert.equal(await pending, false);
  assert.equal(
    await resolveHostTransport("localhost:7000", controller.signal),
    false
  );
  assert.equal(
    await resolveHostTransport("localhost:07000", controller.signal),
    false
  );
  assert.equal(getPrompt(), null);
  const otherPort = resolveHostTransport("localhost:7001", controller.signal);
  (await waitForPrompt()).respond(false);
  await assert.rejects(otherPort, /not approved/);
  assert.equal(
    JSON.parse(storage.get("runelink.demo.host-transports"))["localhost:7001"],
    undefined
  );
});

test("legacy HTTP preference requires approval and cancellation saves nothing", async () => {
  setup({ stored: { "localhost:7000": { secure: false } } });
  const controller = new AbortController();
  const pending = resolveHostTransport("localhost", controller.signal);
  await waitForPrompt();
  controller.abort();
  await assert.rejects(pending);
  assert.equal(getPrompt(), null);
  assert.equal(
    JSON.parse(storage.get("runelink.demo.host-transports"))["localhost:7000"]
      .allow_insecure,
    undefined
  );
});

test("secure connections need no prompt and HTTPS pages never probe HTTP", async () => {
  setup({ secureResponse: new Response("pong") });
  assert.equal(
    await resolveHostTransport("example.com", new AbortController().signal),
    true
  );
  assert.equal(calls.length, 1);
  assert.equal(getPrompt(), null);
  setup({
    protocol: "https:",
    stored: { "localhost:7000": { secure: false, allow_insecure: true } },
  });
  await assert.rejects(
    resolveHostTransport("localhost", new AbortController().signal),
    /requires a secure connection/
  );
  assert.equal(calls.length, 1);
});

test("redirects and HTTP errors never trigger an HTTP fallback", async () => {
  for (const secureResponse of [
    { type: "opaqueredirect", status: 0 },
    new Response("", { status: 503 }),
  ]) {
    setup({ secureResponse });
    await assert.rejects(
      resolveHostTransport("example.com", new AbortController().signal),
      /redirects are not allowed|HTTP 503/
    );
    assert.equal(calls.length, 1);
    assert.equal(getPrompt(), null);
  }
});

test("a stored session retries after transient transport probe failures", async () => {
  setup();
  const originalDocument = globalThis.document;
  // Records sleeps, such as the retry delay, so the test decides when they end
  const timers = new Map();
  const clock = Object.assign(Object.create(Clock.Clock.defaultValue()), {
    sleep: (duration) =>
      Effect.callback((resume) => {
        const id = {};
        timers.set(id, {
          delay: Duration.toMillis(duration),
          callback: () => resume(Effect.void),
        });
        return Effect.sync(() => timers.delete(id));
      }),
  });
  const scope = Scope.makeUnsafe();
  try {
    window.addEventListener = () => {};
    window.removeEventListener = () => {};
    globalThis.document = {
      addEventListener() {},
      removeEventListener() {},
    };
    globalThis.fetch = async () => {
      throw new TypeError("Host offline");
    };
    const { authAtom } = await server.ssrLoadModule("/src/lib/auth-store.ts");
    const session = await server.ssrLoadModule("/src/lib/runelink-session.ts");
    const account = { name: "test", host: "localhost" };
    const authCache = {
      accounts: { "test@localhost": { refresh_token: "test" } },
    };
    // The session reloads the stored tokens when it starts.
    storage.set("runelink.demo.auth-cache", JSON.stringify(authCache));
    registry.set(authAtom, {
      config: { active_account: account, accounts: [account] },
      authCache,
      authError: null,
    });
    const getStatus = () => registry.get(session.connectionAtom).status;
    // Waits for the retry delay, ignoring shorter-lived sleeps such as probe
    // timeouts
    async function waitForRetry(delay) {
      const isRetry = (timer) => timer.delay === delay;
      for (
        let attempt = 0;
        attempt < 100 && ![...timers.values()].some(isRetry);
        attempt++
      ) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    function takeTimer() {
      const [id, timer] = [...timers.entries()][0];
      timers.delete(id);
      return timer;
    }

    await Effect.runPromise(
      Layer.buildWithScope(session.layer, scope).pipe(
        Effect.provideService(Clock.Clock, clock),
        Effect.provide(
          Layer.succeed(Socket.WebSocketConstructor, () => {
            throw new Error("No sockets in this test");
          })
        )
      )
    );
    await waitForRetry(1000);
    assert.equal(getStatus(), "reconnecting");
    assert.equal(timers.size, 1);
    assert.equal([...timers.values()][0].delay, 1000);

    // A temporary HTTP response also retries, without probing plain HTTP.
    const retry = takeTimer();
    calls = [];
    globalThis.fetch = async (url) => {
      calls.push(url);
      return new Response("", { status: 503 });
    };
    retry.callback();
    await waitForRetry(2000);
    assert.equal(getStatus(), "reconnecting");
    assert.equal(timers.size, 1);
    assert.equal([...timers.values()][0].delay, 2000);
    assert.deepEqual(calls, ["https://localhost:7000/ping"]);

    // Denied approval is final and must not create an automatic prompt loop.
    const next = takeTimer();
    setup();
    window.addEventListener = () => {};
    window.removeEventListener = () => {};
    next.callback();
    for (let attempt = 0; attempt < 20 && !getPrompt(); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    assert.ok(getPrompt());
    getPrompt().respond(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(getStatus(), "disconnected");
    assert.equal(timers.size, 0);
  } finally {
    await Effect.runPromise(Scope.close(scope, Exit.void));
    globalThis.document = originalDocument;
  }
});
