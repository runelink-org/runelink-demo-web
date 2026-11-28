import type * as AppNavigationModule from "../src/lib/use-app-navigation.ts";
import assert from "node:assert/strict";
import { afterAll, beforeAll, it, vi } from "@effect/vitest";
import { resourceKey } from "@runelink/sdk";
import type { ServerChannel, ServerWithChannels } from "@runelink/sdk";
import * as Effect from "effect/Effect";

let navigation: typeof AppNavigationModule;

const serverId = "11111111-1111-4111-8111-111111111111";
const channelId = "22222222-2222-4222-8222-222222222222";
const otherChannelId = "33333333-3333-4333-8333-333333333333";
const at = "2026-11-27T12:00:00Z";

function textChannel(host: string, id: string): ServerChannel {
  return {
    id,
    host,
    server_id: serverId,
    kind: "text",
    text_channel_id: id,
    title: id,
    description: null,
    parent_channel_id: null,
    position: id === channelId ? 1 : 0,
    created_at: at,
    updated_at: at,
  };
}

function server(host: string): ServerWithChannels {
  return {
    server: {
      id: serverId,
      host,
      title: host,
      description: null,
      created_at: at,
      updated_at: at,
    },
    channels: [textChannel(host, otherChannelId), textChannel(host, channelId)],
  };
}

// Same-UUID servers on two hosts, and a selected one on a third that the
// account is not in
const servers = [server("a.example"), server("b.example")];
const missing = { host: "c.example", id: serverId };
const destination = { host: "a.example", id: serverId };

beforeAll(() =>
  Effect.gen(function* () {
    vi.stubGlobal("window", {
      location: { protocol: "http:" },
      localStorage: { getItem: () => null, setItem: () => undefined },
    });
    navigation = yield* Effect.promise(
      () => import("../src/lib/use-app-navigation.ts")
    );
  })
);

afterAll(() => {
  vi.unstubAllGlobals();
});

it("a fallback server opens its landing page without a saved channel", () => {
  assert.deepEqual(navigation.getFallbackSelection(servers, missing, {}), {
    server: destination,
    channelId: null,
  });
});

it("a fallback server opens its own saved channel", () => {
  assert.deepEqual(
    navigation.getFallbackSelection(servers, missing, {
      [resourceKey(destination)]: channelId,
    }),
    { server: destination, channelId }
  );
});

it("a fallback server never opens the rejected route's channel ID", () => {
  // The destination has a channel with this ID, but it is another channel
  assert.deepEqual(
    navigation.getFallbackSelection(servers, missing, {
      [resourceKey(missing)]: channelId,
    }),
    { server: destination, channelId: null }
  );
});

it("the selected server keeps its saved channel", () => {
  const selected = { host: "b.example", id: serverId };
  assert.deepEqual(
    navigation.getFallbackSelection(servers, selected, {
      [resourceKey(selected)]: channelId,
      [resourceKey(destination)]: otherChannelId,
    }),
    { server: selected, channelId }
  );
});
