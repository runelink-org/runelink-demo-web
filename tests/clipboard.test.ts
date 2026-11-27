import assert from "node:assert/strict";
import * as Effect from "effect/Effect";
import { afterEach, it, vi } from "@effect/vitest";
import { toast } from "sonner";
import { copyToClipboard } from "../src/lib/clipboard.ts";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.effect(
  "starts the clipboard write immediately and reports a synchronous failure immediately",
  () =>
    Effect.gen(function* () {
      const writeText = vi.fn(() => {
        throw new DOMException(
          "Clipboard access was denied",
          "NotAllowedError"
        );
      });
      vi.stubGlobal("navigator", { clipboard: { writeText } });
      const errorToast = vi
        .spyOn(toast, "error")
        .mockReturnValue("clipboard-toast");

      const completed = copyToClipboard("channel link", "Copied.");
      assert.deepEqual(writeText.mock.calls, [["channel link"]]);
      assert.deepEqual(errorToast.mock.calls, [["Failed to copy."]]);
      yield* Effect.promise(() => completed);
      assert.deepEqual(errorToast.mock.calls, [["Failed to copy."]]);
    })
);
