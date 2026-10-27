import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "vite";

let server;
let resolveHostTransport;
let useHostTransportPrompt;
let storage;
let calls;
const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true },
    appType: "custom",
  });
  ({ resolveHostTransport, useHostTransportPrompt } =
    await server.ssrLoadModule("/src/lib/host-transport.ts"));
});

after(async () => {
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
  await server?.close();
});

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
    const prompt = useHostTransportPrompt.getState().prompt;
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
  assert.equal(useHostTransportPrompt.getState().prompt, null);
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
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(useHostTransportPrompt.getState().prompt, null);
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
  assert.equal(useHostTransportPrompt.getState().prompt, null);
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
    assert.equal(useHostTransportPrompt.getState().prompt, null);
  }
});

test("a stored session retries after transient transport probe failures", async () => {
  setup();
  const originalDocument = globalThis.document;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const timers = new Map();
  try {
    window.addEventListener = () => {};
    globalThis.document = { addEventListener() {} };
    globalThis.fetch = async () => {
      throw new TypeError("Host offline");
    };
    const bridge = await server.ssrLoadModule(
      "/src/lib/auth-session-bridge.ts"
    );
    const connection = await server.ssrLoadModule(
      "/src/lib/runelink-connection-store.ts"
    );
    bridge.registerAuthSessionStateBridge({
      getSnapshot: () => ({
        activeAccount: { name: "test", host: "localhost" },
        activeAuth: { refresh_token: "test" },
        authError: null,
      }),
      subscribe: () => () => {},
    });
    globalThis.setTimeout = (callback, delay) => {
      const id = {};
      timers.set(id, { callback, delay });
      return id;
    };
    globalThis.clearTimeout = (id) => timers.delete(id);
    connection.initializeRunelinkConnectionStore();
    for (let attempt = 0; attempt < 20 && timers.size === 0; attempt++) {
      await new Promise((resolve) => originalSetTimeout(resolve, 0));
    }
    assert.equal(
      connection.useRunelinkConnectionStore.getState().status,
      "reconnecting"
    );
    assert.equal(timers.size, 1);
    assert.equal([...timers.values()][0].delay, 1000);

    // A temporary HTTP response also retries, without probing plain HTTP.
    const [retryId, retry] = [...timers.entries()][0];
    timers.delete(retryId);
    calls = [];
    globalThis.fetch = async (url) => {
      calls.push(url);
      return new Response("", { status: 503 });
    };
    retry.callback();
    for (let attempt = 0; attempt < 20 && timers.size === 0; attempt++) {
      await new Promise((resolve) => originalSetTimeout(resolve, 0));
    }
    assert.equal(
      connection.useRunelinkConnectionStore.getState().status,
      "reconnecting"
    );
    assert.equal(timers.size, 1);
    assert.equal([...timers.values()][0].delay, 2000);
    assert.deepEqual(calls, ["https://localhost:7000/ping"]);

    // Denied approval is final and must not create an automatic prompt loop.
    const [nextId, next] = [...timers.entries()][0];
    timers.delete(nextId);
    setup();
    window.addEventListener = () => {};
    next.callback();
    for (
      let attempt = 0;
      attempt < 20 && !useHostTransportPrompt.getState().prompt;
      attempt++
    ) {
      await new Promise((resolve) => originalSetTimeout(resolve, 0));
    }
    assert.ok(useHostTransportPrompt.getState().prompt);
    useHostTransportPrompt.getState().prompt.respond(false);
    await new Promise((resolve) => originalSetTimeout(resolve, 0));
    assert.equal(
      connection.useRunelinkConnectionStore.getState().status,
      "disconnected"
    );
    assert.equal(timers.size, 0);
    connection.useRunelinkConnectionStore.getState().disconnect();
  } finally {
    globalThis.document = originalDocument;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});
