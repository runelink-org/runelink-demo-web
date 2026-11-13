export type TextareaSelection = {
  start: number;
  end: number;
  direction: "forward" | "backward" | "none";
};

export function readTextareaSelection(
  input: HTMLTextAreaElement
): TextareaSelection {
  return {
    start: input.selectionStart,
    end: input.selectionEnd,
    direction: input.selectionDirection,
  };
}

export function sameTextareaSelection(
  first: TextareaSelection | null,
  second: TextareaSelection
): boolean {
  return (
    first?.start === second.start &&
    first.end === second.end &&
    first.direction === second.direction
  );
}

export function restoreTextareaSelection(
  input: HTMLTextAreaElement,
  selection: TextareaSelection | null
) {
  const end = input.value.length;
  input.setSelectionRange(
    selection?.start ?? end,
    selection?.end ?? end,
    selection?.direction ?? "none"
  );
}
