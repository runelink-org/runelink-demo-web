import assert from "node:assert/strict";
import { it } from "@effect/vitest";
import { getAppRoutePath, parseAppRoute } from "../src/lib/app-route.ts";
import * as fixtures from "./fixtures.ts";

const serverRef = fixtures.serverRef({
  host: "localhost:7001",
  id: fixtures.uuid(1),
});
const channelId = fixtures.serverChannelId(fixtures.uuid(2));
const messageId = fixtures.messageId(fixtures.uuid(3));
const serverPath = `/servers/${encodeURIComponent(serverRef.host)}/${serverRef.id}`;

it("message links round-trip through the channel URL", () => {
  const route = { screen: "channel" as const, serverRef, channelId, messageId };
  const url = new URL(getAppRoutePath(route), "https://app.runelink.chat");
  assert.equal(url.search, `?message=${messageId}`);
  assert.equal(
    getAppRoutePath(
      { screen: "channel" as const, serverRef, channelId },
      messageId
    ),
    `${url.pathname}${url.search}`
  );
  assert.deepEqual(parseAppRoute(url.pathname, url.search), route);
  assert.deepEqual(
    parseAppRoute(url.pathname, `?other=value&message=${messageId}`),
    route
  );
});

it("invalid message targets leave the channel accessible", () => {
  const path = `${serverPath}/channels/${channelId}`;
  const route = { screen: "channel" as const, serverRef, channelId };
  for (const search of [
    "",
    "?message=",
    "?message=invalid",
    "?message=%E0%A4%A",
  ]) {
    assert.deepEqual(parseAppRoute(path, search), route);
  }
  assert.deepEqual(parseAppRoute(`${path}/settings`, `?message=${messageId}`), {
    screen: "channel-settings" as const,
    serverRef,
    channelId,
  });
});

it("routes name the server's host", () => {
  for (const route of [
    { screen: "server" as const, serverRef },
    { screen: "server-settings" as const, serverRef },
    { screen: "channel-settings" as const, serverRef, channelId },
    { screen: "channel-members" as const, serverRef, channelId },
  ]) {
    const path = getAppRoutePath(route);
    assert.ok(path.startsWith(serverPath), path);
    assert.deepEqual(parseAppRoute(path), route);
    assert.deepEqual(parseAppRoute(`${path}/`), route);
  }
  // The same ID on another host is another server
  assert.notDeepEqual(
    parseAppRoute(`/servers/localhost/${serverRef.id}`),
    parseAppRoute(serverPath)
  );
});

it("IPv6 hosts round-trip through routes", () => {
  const route = {
    screen: "channel" as const,
    serverRef: { host: fixtures.host("[::1]:7001"), id: serverRef.id },
    channelId,
  };
  const url = new URL(getAppRoutePath(route), "https://app.runelink.chat");
  assert.deepEqual(parseAppRoute(url.pathname, url.search), route);
});

it("routes reject missing hosts, malformed IDs, and unknown nested pages", () => {
  for (const path of [
    `/servers/${serverRef.id}`,
    `/servers/${serverRef.id}/channels/${channelId}`,
    `/servers//${serverRef.id}`,
    `${serverPath}/channels/invalid/settings`,
    `/servers/${encodeURIComponent(serverRef.host)}/invalid/channels/${channelId}/settings`,
    `${serverPath}/channels/${channelId}/settings/extra`,
    `/servers/%E0%A4%A/${serverRef.id}`,
  ]) {
    assert.equal(parseAppRoute(path), null, path);
  }
});

it("percent-encoded server IDs decode before validation", () => {
  const encodedId = serverRef.id.replace("1", "%31");
  assert.deepEqual(
    parseAppRoute(
      `/servers/${encodeURIComponent(serverRef.host)}/${encodedId}`
    ),
    { screen: "server", serverRef }
  );
});
