import * as fixtures from "./fixtures.ts";
import type * as AccountDeletionModule from "../src/lib/account-deletion.ts";
import type * as AuthStoreModule from "../src/lib/auth-store.ts";
import type * as AtomRegistryModule from "../src/lib/atom-registry.ts";
import assert from "node:assert/strict";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";
import { afterAll, beforeAll, beforeEach, it, vi } from "@effect/vitest";

const alice = fixtures.userRef({ name: "alice", host: "example.com" });

let storage: Map<string, string>;
let accountDeletion: typeof AccountDeletionModule;
let authAtom: typeof AuthStoreModule.authAtom;
let registry: typeof AtomRegistryModule.appAtomRegistry;
const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

beforeAll(() =>
  Effect.gen(function* () {
    storage = new Map<string, string>();
    vi.stubGlobal("window", {
      location: { protocol: "https:" },
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });
    accountDeletion = yield* Effect.promise(
      () => import("../src/lib/account-deletion.ts")
    );
    ({ authAtom } = yield* Effect.promise(
      () => import("../src/lib/auth-store.ts")
    ));
    ({ appAtomRegistry: registry } = yield* Effect.promise(
      () => import("../src/lib/atom-registry.ts")
    ));
  })
);

afterAll(() => {
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
});

beforeEach(() => {
  storage.clear();
});

const lookupCases = [
  [
    "the host's not-found error",
    () => Response.json({ error: "Resource not found" }, { status: 404 }),
    true,
  ],
  [
    "another 404 body",
    () => Response.json({ error: "No upstream" }, { status: 404 }),
    false,
  ],
  ["a 404 without a body", () => new Response("", { status: 404 }), false],
  ["a server error", () => new Response("", { status: 500 }), false],
  [
    "an unreachable host",
    () => {
      throw new TypeError("offline");
    },
    false,
  ],
] as const;

it.effect.each(
  lookupCases.map(([label, respond, deleted]) => ({
    title: `a lookup returning ${label} ${deleted ? "removes" : "keeps"} the account`,
    respond,
    deleted,
  }))
)("$title", ({ respond, deleted }) =>
  Effect.gen(function* () {
    const urls: string[] = [];
    globalThis.fetch = (url) => {
      assert.ok(typeof url === "string");
      urls.push(url);
      return Promise.resolve().then(respond);
    };
    registry.update(authAtom, (state) => ({
      ...state,
      config: { active_account: alice, accounts: [alice] },
      authCache: {
        accounts: { "alice@example.com": { refresh_token: "t" } },
      },
    }));

    yield* accountDeletion.checkAccountDeleted(alice);

    assert.deepEqual(urls, [
      "https://example.com:7000/users/example.com/alice",
    ]);
    const { config, authCache } = registry.get(authAtom);
    assert.deepEqual(config.accounts, deleted ? [] : [alice]);
    assert.equal(config.active_account, deleted ? null : alice);
    assert.equal("alice@example.com" in authCache.accounts, !deleted);
  })
);

it.effect("a timed-out account lookup aborts the response body read", () =>
  Effect.gen(function* () {
    const reading = yield* Deferred.make<AbortSignal>();
    globalThis.fetch = (_url, init) => {
      const signal = init?.signal;
      assert.ok(signal);
      const body = new ReadableStream<Uint8Array>(
        {
          start(controller) {
            signal.addEventListener(
              "abort",
              () => {
                controller.error(
                  new DOMException("The lookup timed out", "AbortError")
                );
              },
              { once: true }
            );
          },
          pull() {
            Deferred.doneUnsafe(reading, Exit.succeed(signal));
          },
        },
        { highWaterMark: 0 }
      );
      return Promise.resolve(new Response(body, { status: 404 }));
    };
    registry.update(authAtom, (state) => ({
      ...state,
      config: { active_account: alice, accounts: [alice] },
    }));

    const lookup = yield* Effect.forkScoped(
      accountDeletion.checkAccountDeleted(alice),
      { startImmediately: true }
    );
    const signal = yield* Deferred.await(reading);
    assert.equal(signal.aborted, false);
    yield* TestClock.adjust("10 seconds");
    yield* Fiber.join(lookup);

    assert.equal(signal.aborted, true);
    assert.deepEqual(registry.get(authAtom).config.active_account, alice);
  })
);
