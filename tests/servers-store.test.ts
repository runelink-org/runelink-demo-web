import type * as ServersStoreModule from "../src/lib/servers-store.ts";
import type * as RunelinkSessionModule from "../src/lib/runelink-session.ts";
import assert from "node:assert/strict";
import { afterAll, beforeAll, it, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { controlledSession } from "./session-fixture.ts";
import type { PendingRequest } from "./session-fixture.ts";

let servers: typeof ServersStoreModule;
let session: RunelinkSessionModule.RunelinkSession["Service"];
let sessionTag: typeof RunelinkSessionModule.RunelinkSession;

let NotConnectedError: typeof RunelinkSessionModule.NotConnectedError;
const requests: PendingRequest[] = [];

beforeAll(() =>
  Effect.gen(function* () {
    vi.stubGlobal("window", {
      location: { protocol: "http:" },
      localStorage: { getItem: () => null, setItem: () => undefined },
    });
    const session$ = yield* Effect.promise(
      () => import("../src/lib/runelink-session.ts")
    );
    sessionTag = session$.RunelinkSession;
    ({ NotConnectedError } = session$);
    // Requests wait until a test settles them.
    session = controlledSession(requests);
    servers = yield* Effect.promise(
      () => import("../src/lib/servers-store.ts")
    );
  })
);

afterAll(() => {
  vi.unstubAllGlobals();
});

it.effect("concurrent channel loads of a server share one request", () =>
  Effect.gen(function* () {
    const first = yield* Effect.forkScoped(
      servers.fetchServerWithChannels("server", "peer.example"),
      { startImmediately: true }
    );
    const second = yield* Effect.forkScoped(
      servers.fetchServerWithChannels("server", "peer.example"),
      { startImmediately: true }
    );
    assert.equal(requests.length, 1);
    const sent = requests[0].request;
    assert.ok("data" in sent && "target_host" in sent.data);
    assert.equal(sent.data.target_host, "peer.example");
    requests[0].reject(new NotConnectedError());
    assert.equal(
      (yield* first.pipe(Fiber.join, Effect.flip))._tag,
      "NotConnectedError"
    );
    assert.equal(
      (yield* second.pipe(Fiber.join, Effect.flip))._tag,
      "NotConnectedError"
    );

    // A settled load isn't shared with later loads
    const retry = yield* Effect.forkScoped(
      servers.fetchServerWithChannels("server", "peer.example"),
      { startImmediately: true }
    );
    assert.equal(requests.length, 2);
    const data = {
      server: {
        id: "server",
        host: "peer.example",
        title: "Test",
        description: null,
        created_at: "2026-11-27T12:00:00Z",
        updated_at: "2026-11-27T12:00:00Z",
      },
      channels: [],
    };
    requests[1].resolve({ type: "servers_get_with_channels", data });
    const loaded = yield* Fiber.join(retry);
    assert.deepEqual(loaded, data);
  }).pipe(Effect.provideService(sessionTag, session))
);
