import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { createServer } from "vite";

const CONFIG_KEY = "runelink.demo.app-config";
const AUTH_KEY = "runelink.demo.auth-cache";
const alice = { name: "alice", host: "example.com" };

let server;
let storage;
let accountStorage;
let accountDeletion;
let useAuthStore;
const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

before(async () => {
  storage = new Map();
  globalThis.window = {
    location: { protocol: "https:" },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
  };
  server = await createServer({
    // Another test file runs its own server, so skip the shared HMR socket.
    server: { middlewareMode: true, ws: false },
    appType: "custom",
  });
  accountStorage = await server.ssrLoadModule("/src/lib/account-storage.ts");
  accountDeletion = await server.ssrLoadModule("/src/lib/account-deletion.ts");
  ({ useAuthStore } = await server.ssrLoadModule("/src/lib/auth-store.ts"));
});

after(async () => {
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
  await server?.close();
});

beforeEach(() => {
  storage.clear();
});

test("saved accounts drop the default port and keep the canonical session", () => {
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

  assert.deepEqual(accountStorage.loadBrowserAppConfig(), {
    default_account: alice,
    accounts: [alice, { name: "bob", host: "example.com:7001" }],
  });
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
]) {
  test(`a lookup returning ${label} ${deleted ? "removes" : "keeps"} the account`, async () => {
    const urls = [];
    globalThis.fetch = async (url) => {
      urls.push(url);
      return respond();
    };
    useAuthStore.setState({
      config: { default_account: alice, accounts: [alice] },
      authCache: { accounts: { "alice@example.com": { refresh_token: "t" } } },
    });

    await accountDeletion.checkAccountDeleted(alice);

    assert.deepEqual(urls, ["https://example.com:7000/users/example.com/alice"]);
    const { config, authCache } = useAuthStore.getState();
    assert.deepEqual(config.accounts, deleted ? [] : [alice]);
    assert.equal(config.default_account, deleted ? null : alice);
    assert.equal("alice@example.com" in authCache.accounts, !deleted);
  });
}
