import assert from "node:assert/strict";
import { test } from "node:test";
import { getAppRoutePath, parseAppRoute } from "../src/lib/app-route.ts";

const serverId = "00000000-0000-4000-8000-000000000001";
const channelId = "00000000-0000-4000-8000-000000000002";

test("channel and category settings have a distinct, reloadable route", () => {
  const route = { screen: "channel-settings", serverId, channelId };
  const path = `/servers/${serverId}/channels/${channelId}/settings`;
  assert.equal(getAppRoutePath(route), path);
  assert.deepEqual(parseAppRoute(path), route);
  assert.deepEqual(parseAppRoute(`${path}/`), route);
  assert.deepEqual(parseAppRoute(`/servers/${serverId}/channels/${channelId}`), { screen: "channel", serverId, channelId });
  assert.deepEqual(parseAppRoute(`/servers/${serverId}/channels/${channelId}/members`), { screen: "channel-members", serverId, channelId });
});

test("settings routes reject malformed IDs and unknown nested pages", () => {
  assert.equal(parseAppRoute(`/servers/${serverId}/channels/invalid/settings`), null);
  assert.equal(parseAppRoute(`/servers/invalid/channels/${channelId}/settings`), null);
  assert.equal(parseAppRoute(`/servers/${serverId}/channels/${channelId}/settings/extra`), null);
});
