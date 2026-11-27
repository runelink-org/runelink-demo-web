import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { toast } from "sonner";

class ClipboardWriteError extends Schema.TaggedError<ClipboardWriteError>()(
  "ClipboardWriteError",
  {}
) {}

const copy = Effect.fn("Clipboard.copy")(function* (
  value: string,
  successLabel: string,
  failureLabel: string
) {
  if (typeof navigator === "undefined" || navigator.clipboard === undefined) {
    toast.error("Clipboard is not available.");
    return;
  }

  yield* Effect.tryPromise({
    try: () => navigator.clipboard.writeText(value),
    catch: () => new ClipboardWriteError(),
  }).pipe(
    Effect.match({
      onSuccess: () => {
        toast.success(successLabel);
      },
      onFailure: () => {
        toast.error(failureLabel);
      },
    })
  );
});

export function copyToClipboard(
  value: string,
  successLabel: string,
  failureLabel = "Failed to copy."
): Promise<void> {
  return Effect.runPromise(copy(value, successLabel, failureLabel));
}
