import assert from "node:assert/strict";
import { test } from "node:test";
import { newestResource } from "../src/lib/resource-version.ts";

test("stale snapshots retain newer metadata and exact edit versions", () => {
  const old = { id: "resource", title: "Old name", updated_at: new Date("2026-10-28T12:00:00.123Z"), update_version: "2026-10-28T12:00:00.123001Z" };
  const edited = { ...old, title: "Edited name", update_version: "2026-10-28T12:00:00.123002Z" };
  assert.equal(newestResource(old, edited), edited);
  assert.equal(newestResource(edited, old), edited);
  assert.equal(newestResource(old, undefined), old);
});
