import assert from "node:assert/strict";
import { it } from "@effect/vitest";
import { mergeMessages } from "../src/lib/message-cache.ts";
import * as fixtures from "./fixtures.ts";

const active = fixtures.activeMessage({
  id: fixtures.uuid(1),
  host: "localhost",
  text_channel_id: fixtures.uuid(2),
  author: null,
  edited_at: null,
  reply_to: null,
  body: "text to erase",
  deleted_at: null,
  created_at: "2026-10-19T12:00:00Z",
  updated_at: "2026-10-19T12:00:00Z",
});
const deleted = fixtures.message({
  ...active,
  body: null,
  deleted_at: "2026-10-19T12:01:00Z",
  updated_at: "2026-10-19T12:01:00Z",
});

it("delayed creates and history cannot restore deleted text", () => {
  assert.deepEqual(mergeMessages([deleted], [active]), [deleted]);
  assert.deepEqual(mergeMessages([active], [deleted]), [deleted]);
  assert.deepEqual(mergeMessages([], [deleted, active]), [deleted]);
  assert.deepEqual(mergeMessages([deleted], []), [deleted]);
});

it("history merges preserve newly received replies", () => {
  const reply = {
    ...active,
    id: fixtures.messageId(fixtures.uuid(3)),
    reply_to: active.id,
    created_at: "2026-10-19T12:02:00Z",
  };
  assert.deepEqual(mergeMessages([deleted, reply], [active]), [deleted, reply]);
});

it("late create replies and stale history cannot overwrite edits within a millisecond", () => {
  const original = { ...active, updated_at: "2026-10-19T12:00:00.000001Z" };
  const edited = {
    ...original,
    body: "corrected text",
    updated_at: "2026-10-19T12:00:00.000002Z",
  };
  assert.deepEqual(mergeMessages([edited], [original]), [edited]);
  assert.deepEqual(mergeMessages([original], [edited]), [edited]);
  assert.deepEqual(mergeMessages([], [edited, original]), [edited]);
});
