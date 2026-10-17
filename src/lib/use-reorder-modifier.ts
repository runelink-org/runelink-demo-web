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

// Whether a reorder modifier is held outside of text entry
export function useReorderModifierHeld(): boolean {
  const [isHeld, setIsHeld] = useState(false);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      setIsHeld(
        isRevealModifierHeld(event) &&
          !isEditableElement(document.activeElement)
      );
    }

    // Key releases are missed while the window is unfocused
    function handleBlur() {
      setIsHeld(false);
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

  return isHeld;
}
