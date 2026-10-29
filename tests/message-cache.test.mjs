import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeMessages } from "../src/lib/message-cache.ts";

const active = {
  id: "original",
  text_channel_id: "channel",
  author: null,
  reply_to: null,
  body: "text to erase",
  deleted_at: null,
  created_at: "2026-10-19T12:00:00Z",
  updated_at: "2026-10-19T12:00:00Z",
};
const deleted = {
  ...active,
  body: null,
  deleted_at: "2026-10-19T12:01:00Z",
  updated_at: "2026-10-19T12:01:00Z",
};

test("delayed creates and history cannot restore deleted text", () => {
  assert.deepEqual(mergeMessages([deleted], [active]), [deleted]);
  assert.deepEqual(mergeMessages([active], [deleted]), [deleted]);
  assert.deepEqual(mergeMessages([], [deleted, active]), [deleted]);
  assert.deepEqual(mergeMessages([deleted], []), [deleted]);
});

test("history merges preserve newly received replies", () => {
  const reply = {
    ...active,
    id: "reply",
    reply_to: active.id,
    created_at: "2026-10-19T12:02:00Z",
  };
  assert.deepEqual(mergeMessages([deleted, reply], [active]), [deleted, reply]);
});

test("late create replies and stale history cannot overwrite edits within a millisecond", () => {
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
