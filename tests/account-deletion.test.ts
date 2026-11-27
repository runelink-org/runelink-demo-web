import assert from "node:assert/strict";
import * as Effect from "effect/Effect";
import { afterAll, beforeAll, beforeEach, it, vi } from "@effect/vitest";

const CONFIG_KEY = "runelink.demo.app-config";
const AUTH_KEY = "runelink.demo.auth-cache";
const alice = { name: "alice", host: "example.com" };

let storage: Map<string, string>;
let accountStorage: typeof import("../src/lib/account-storage.ts");
let accountDeletion: typeof import("../src/lib/account-deletion.ts");
let authAtom: typeof import("../src/lib/auth-store.ts").authAtom;
let registry: typeof import("../src/lib/atom-registry.ts").appAtomRegistry;
const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

beforeAll(async () => {
  storage = new Map<string, string>();
  vi.stubGlobal("window", {
    location: { protocol: "https:" },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  accountStorage = await import("../src/lib/account-storage.ts");
  accountDeletion = await import("../src/lib/account-deletion.ts");
  ({ authAtom } = await import("../src/lib/auth-store.ts"));
  ({ appAtomRegistry: registry } = await import("../src/lib/atom-registry.ts"));
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
});

beforeEach(() => {
  storage.clear();
});

it("saved accounts drop the default port, keep the canonical session, and migrate the active account", () => {
  storage.set(
    CONFIG_KEY,
    JSON.stringify({
      default_account: { name: "alice", host: "example.com:7000" },
      accounts: [
        { name: "alice", host: "example.com:7000" },
        alice,
        { name: "bob", host: "example.com:7001" },
      ],
    })
  );
  storage.set(
    AUTH_KEY,
    JSON.stringify({
      accounts: {
        "alice@example.com:7000": { refresh_token: "old" },
        "alice@example.com": { refresh_token: "new" },
        "carol@example.com:7000": { refresh_token: "carol" },
      },
    })
  );

  const expectedConfig = {
    active_account: alice,
    accounts: [alice, { name: "bob", host: "example.com:7001" }],
  };
  assert.deepEqual(accountStorage.loadBrowserAppConfig(), expectedConfig);
  assert.deepEqual(JSON.parse(storage.get(CONFIG_KEY) ?? ""), expectedConfig);
  assert.deepEqual(accountStorage.loadBrowserAuthCache().accounts, {
    "alice@example.com": { refresh_token: "new" },
    "carol@example.com": { refresh_token: "carol" },
  });
});

for (const [label, respond, deleted] of [
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
] as const) {
  it.effect(
    `a lookup returning ${label} ${deleted ? "removes" : "keeps"} the account`,
    () =>
      Effect.gen(function* () {
        const urls: string[] = [];
        globalThis.fetch = async (url) => {
          assert.ok(typeof url === "string");
          urls.push(url);
          return respond();
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
}
