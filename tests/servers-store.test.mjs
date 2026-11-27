import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { createServer } from "vite";

let server;
let servers;
let run;
let NotConnectedError;
const requests = [];
const originalWindow = globalThis.window;

before(async () => {
  globalThis.window = {
    location: { protocol: "http:" },
    localStorage: { getItem: () => null, setItem: () => {} },
  };
  server = await createServer({
    server: { middlewareMode: true, ws: false },
    appType: "custom",
    // Keep a running dev server's optimized dependencies intact.
    cacheDir: "node_modules/.vite-test",
  });
  const session$ = await server.ssrLoadModule("/src/lib/runelink-session.ts");
  const { RunelinkSession } = session$;
  ({ NotConnectedError } = session$);
  // Requests wait until a test settles them.
  const session = Layer.succeed(
    RunelinkSession,
    RunelinkSession.of({
      request: (request) =>
        Effect.callback((resume) => {
          requests.push({ request, resume });
        }),
    })
  );
  run = (effect) => Effect.runPromise(Effect.provide(effect, session));
  servers = await server.ssrLoadModule("/src/lib/servers-store.ts");
});

after(async () => {
  globalThis.window = originalWindow;
  await server?.close();
});

test("concurrent channel loads of a server share one request", async () => {
  const first = run(servers.fetchServerWithChannels("server", "peer.example"));
  const second = run(servers.fetchServerWithChannels("server", "peer.example"));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].request.data.target_host, "peer.example");
  const failures = Promise.all([
    assert.rejects(first, { _tag: "NotConnectedError" }),
    assert.rejects(second, { _tag: "NotConnectedError" }),
  ]);
  requests[0].resume(Effect.fail(new NotConnectedError()));
  await failures;

  // A settled load isn't shared with later loads
  const retry = run(servers.fetchServerWithChannels("server", "peer.example"));
  assert.equal(requests.length, 2);
  const data = {
    server: { id: "server", updated_at: "2026-11-27T12:00:00Z" },
    channels: [],
  };
  requests[1].resume(
    Effect.succeed({ type: "servers_get_with_channels", data })
  );
  assert.deepEqual(await retry, data);
});
