import assert from "node:assert/strict";
import { afterAll, beforeAll, it, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import { controlledSession } from "./session-fixture.ts";
import type { PendingRequest } from "./session-fixture.ts";

let servers: typeof import("../src/lib/servers-store.ts");
let session: Layer.Layer<RunelinkSession>;
import type { RunelinkSession } from "../src/lib/runelink-session.ts";

let NotConnectedError: typeof import("../src/lib/runelink-session.ts").NotConnectedError;
const requests: PendingRequest[] = [];
const originalWindow = globalThis.window;

beforeAll(async () => {
  vi.stubGlobal("window", {
    location: { protocol: "http:" },
    localStorage: { getItem: () => null, setItem: () => {} },
  });
  const session$ = await import("../src/lib/runelink-session.ts");
  const { RunelinkSession } = session$;
  ({ NotConnectedError } = session$);
  // Requests wait until a test settles them.
  session = Layer.succeed(RunelinkSession, controlledSession(requests));
  servers = await import("../src/lib/servers-store.ts");
});

afterAll(() => {
  globalThis.window = originalWindow;
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
      (yield* Effect.flip(Fiber.join(first)))._tag,
      "NotConnectedError"
    );
    assert.equal(
      (yield* Effect.flip(Fiber.join(second)))._tag,
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
    assert.deepEqual(yield* Fiber.join(retry), data);
  }).pipe(Effect.provide(session))
);
