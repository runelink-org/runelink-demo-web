import assert from "node:assert/strict";
import { test } from "node:test";
import {
  compareResourceVersions,
  newestResource,
} from "../src/lib/resource-version.ts";

test("stale snapshots retain newer metadata and exact edit versions", () => {
  const old = {
    id: "resource",
    title: "Old name",
    updated_at: "2026-10-28T12:00:00.123001Z",
  };
  const edited = {
    ...old,
    title: "Edited name",
    updated_at: "2026-10-28T12:00:00.123002Z",
  };
  assert.equal(newestResource(old, edited), edited);
  assert.equal(newestResource(edited, old), edited);
  assert.equal(newestResource(old, undefined), old);
});

test("resource ordering handles offsets and different fractional precision", () => {
  const cases = [
    ["2026-10-28T12:00:00.123Z", "2026-10-28T12:00:00.123000Z", 0],
    ["2026-10-28T12:00:00Z", "2026-10-28T12:00:00.000000001Z", -1],
    ["2026-10-28T12:00:01Z", "2026-10-28T12:00:00.999999999Z", 1],
    ["2026-10-28T14:00:00.123456+02:00", "2026-10-28T12:00:00.123456Z", 0],
    ["2026-10-28T07:00:00.123457-05:00", "2026-10-28T12:00:00.123456Z", 1],
  ];
  for (const [left, right, expected] of cases) {
    assert.equal(
      Math.sign(
        compareResourceVersions({ updated_at: left }, { updated_at: right })
      ),
      expected
    );
  }
});
