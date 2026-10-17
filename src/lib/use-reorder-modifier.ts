import { useEffect, useState } from "react";

function isEditableElement(element: Element | null): boolean {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    (element instanceof HTMLElement && element.isContentEditable)
  );
}

// Shift or Ctrl reveal reorder handles, as does Cmd on macOS, where
// Ctrl-click opens the context menu
function isRevealModifierHeld(event: KeyboardEvent): boolean {
  return event.shiftKey || event.ctrlKey || event.metaKey;
}

// Whether a reorder modifier is held outside of text entry, so typing
// capitals doesn't flash the handles
export function useReorderModifierHeld(): boolean {
  const [isModifierHeld, setIsModifierHeld] = useState(false);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      setIsModifierHeld(isRevealModifierHeld(event));
    }

    // Key releases are missed while the window is unfocused
    function handleBlur() {
      setIsModifierHeld(false);
    }

    window.addEventListener("keydown", handleKey);
    window.addEventListener("keyup", handleKey);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("keyup", handleKey);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  return isModifierHeld && !isEditableElement(document.activeElement);
}
