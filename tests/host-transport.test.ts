import assert from "node:assert/strict";
import { afterAll, beforeAll, it, vi } from "@effect/vitest";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Socket from "effect/socket/Socket";

let hostTransport: typeof import("../src/lib/host-transport.ts");
let registry: typeof import("../src/lib/atom-registry.ts").appAtomRegistry;
let storage: Map<string, string>;
let calls: { url: string; options?: RequestInit }[];
const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

beforeAll(async () => {
  hostTransport = await import("../src/lib/host-transport.ts");
  ({ appAtomRegistry: registry } = await import("../src/lib/atom-registry.ts"));
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
});

function getPrompt() {
  return registry.get(hostTransport.hostTransportPromptAtom);
}

function setup({
  stored = {},
  protocol = "http:",
  secureResponse,
}: { stored?: object; protocol?: string; secureResponse?: Response } = {}) {
  storage = new Map([
    ["runelink.demo.host-transports", JSON.stringify(stored)],
  ]);
  calls = [];
  vi.stubGlobal("window", {
    location: { protocol },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  globalThis.fetch = async (url, options) => {
    assert.ok(typeof url === "string");
    calls.push({ url, options });
    if (url.startsWith("https:")) {
      if (secureResponse) return secureResponse;
      throw new TypeError("TLS failed");
    }
    return new Response("pong");
  };
}

const waitForPrompt = Effect.fn("HostTransportTest.waitForPrompt")(
  function* () {
    const existing = getPrompt();
    if (existing) return existing;
    return yield* Effect.callback<NonNullable<ReturnType<typeof getPrompt>>>(
      (resume) => {
        const unsubscribe = registry.subscribe(
          hostTransport.hostTransportPromptAtom,
          (prompt) => {
            if (prompt) {
              unsubscribe();
              resume(Effect.succeed(prompt));
            }
          }
        );
        return Effect.sync(unsubscribe);
      }
    );
  }
);

it.effect(
  "HTTP requires approval, remembers it across default-port aliases, and separates ports",
  () =>
    Effect.gen(function* () {
      setup();
      const pending = yield* Effect.forkScoped(
        hostTransport.resolveHostTransport("localhost"),
        { startImmediately: true }
      );
      const prompt = yield* waitForPrompt();
      assert.equal(prompt.host, "localhost:7000");
      assert.deepEqual(
        JSON.parse(storage.get("runelink.demo.host-transports") ?? ""),
        {}
      );
      for (const { options } of calls) {
        assert.equal(options?.credentials, "omit");
        assert.equal(options?.redirect, "manual");
      }
      prompt.respond(true);
      assert.equal(yield* Fiber.join(pending), false);
      assert.equal(
        yield* hostTransport.resolveHostTransport("localhost:7000"),
        false
      );
      assert.equal(
        yield* hostTransport.resolveHostTransport("localhost:07000"),
        false
      );
      assert.equal(getPrompt(), null);
      const otherPort = yield* Effect.forkScoped(
        hostTransport.resolveHostTransport("localhost:7001"),
        { startImmediately: true }
      );
      (yield* waitForPrompt()).respond(false);
      assert.match(
        (yield* Effect.flip(Fiber.join(otherPort))).message,
        /not approved/
      );
      assert.equal(
        JSON.parse(storage.get("runelink.demo.host-transports") ?? "")[
          "localhost:7001"
        ],
        undefined
      );
    })
);

it.effect(
  "legacy HTTP preference requires approval and cancellation saves nothing",
  () =>
    Effect.gen(function* () {
      setup({ stored: { "localhost:7000": { secure: false } } });
      const pending = yield* Effect.forkScoped(
        hostTransport.resolveHostTransport("localhost"),
        { startImmediately: true }
      );
      yield* waitForPrompt();
      yield* Fiber.interrupt(pending);
      assert.ok(Exit.hasInterrupts(yield* Fiber.await(pending)));
      assert.equal(getPrompt(), null);
      assert.equal(
        JSON.parse(storage.get("runelink.demo.host-transports") ?? "")[
          "localhost:7000"
        ].allow_insecure,
        undefined
      );
    })
);

it.effect(
  "secure connections need no prompt and HTTPS pages never probe HTTP",
  () =>
    Effect.gen(function* () {
      setup({ secureResponse: new Response("pong") });
      assert.equal(
        yield* hostTransport.resolveHostTransport("example.com"),
        true
      );
      assert.equal(calls.length, 1);
      assert.equal(getPrompt(), null);
      setup({
        protocol: "https:",
        stored: { "localhost:7000": { secure: false, allow_insecure: true } },
      });
      assert.match(
        (yield* Effect.flip(hostTransport.resolveHostTransport("localhost")))
          .message,
        /requires a secure connection/
      );
      assert.equal(calls.length, 1);
    })
);

it.effect("redirects and HTTP errors never trigger an HTTP fallback", () =>
  Effect.gen(function* () {
    for (const secureResponse of [
      Object.defineProperty(Response.error(), "type", {
        value: "opaqueredirect",
      }),
      new Response("", { status: 503 }),
    ]) {
      setup({ secureResponse });
      assert.match(
        (yield* Effect.flip(hostTransport.resolveHostTransport("example.com")))
          .message,
        /redirects are not allowed|HTTP 503/
      );
      assert.equal(calls.length, 1);
      assert.equal(getPrompt(), null);
    }
  })
);

it.effect(
  "a stored session retries after transient transport probe failures",
  () =>
    Effect.gen(function* () {
      setup();
      const originalDocument = globalThis.document;
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          globalThis.document = originalDocument;
        })
      );
      window.addEventListener = () => {};
      window.removeEventListener = () => {};
      vi.stubGlobal("document", new EventTarget());
      globalThis.fetch = (url) => {
        assert.ok(typeof url === "string");
        calls.push({ url });
        return Promise.reject(new TypeError("Host offline"));
      };
      const { authAtom } = yield* Effect.promise(
        () => import("../src/lib/auth-store.ts")
      );
      const session = yield* Effect.promise(
        () => import("../src/lib/runelink-session.ts")
      );
      const account = { name: "test", host: "localhost" };
      const authCache = {
        accounts: { "test@localhost": { refresh_token: "test" } },
      };
      storage.set("runelink.demo.auth-cache", JSON.stringify(authCache));
      registry.set(authAtom, {
        config: { active_account: account, accounts: [account] },
        authCache,
        authError: null,
      });
      const getStatus = () => registry.get(session.connectionAtom).status;

      const clock = yield* Clock.Clock;
      const activeSleeps = new Set<object>();
      const trackedClock: Clock.Clock = {
        ...clock,
        sleep: (duration) =>
          Effect.acquireUseRelease(
            Effect.sync(() => {
              const sleep = {};
              activeSleeps.add(sleep);
              return sleep;
            }),
            () => clock.sleep(duration),
            (sleep) =>
              Effect.sync(() => {
                activeSleeps.delete(sleep);
              })
          ),
      };
      yield* Layer.build(session.layer).pipe(
        Effect.provideService(Clock.Clock, trackedClock),
        Effect.provideService(Socket.WebSocketConstructor, () => {
          throw new Error("No sockets in this test");
        })
      );
      yield* TestClock.adjust(999);
      assert.equal(activeSleeps.size, 1);
      assert.equal(getStatus(), "reconnecting");
      assert.deepEqual(
        calls.map(({ url }) => url),
        ["https://localhost:7000/ping", "http://localhost:7000/ping"]
      );

      // A temporary HTTP response also retries, without probing plain HTTP.
      calls = [];
      globalThis.fetch = (url) => {
        assert.ok(typeof url === "string");
        calls.push({ url });
        return Promise.resolve(new Response("", { status: 503 }));
      };
      yield* TestClock.adjust(1);
      assert.equal(getStatus(), "reconnecting");
      assert.deepEqual(
        calls.map(({ url }) => url),
        ["https://localhost:7000/ping"]
      );
      yield* TestClock.adjust(1999);
      assert.equal(activeSleeps.size, 1);
      assert.equal(calls.length, 1);

      // Denied approval is final and must not create an automatic prompt loop.
      setup();
      window.addEventListener = () => {};
      window.removeEventListener = () => {};
      yield* TestClock.adjust(1);
      (yield* waitForPrompt()).respond(false);
      yield* TestClock.adjust(0);
      assert.equal(activeSleeps.size, 0);
      assert.equal(getStatus(), "disconnected");
      assert.equal(getPrompt(), null);
      assert.equal(calls.length, 2);
    })
);
