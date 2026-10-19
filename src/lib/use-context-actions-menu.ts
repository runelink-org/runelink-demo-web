import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type HTMLAttributes,
  type SyntheticEvent,
} from "react";
import type { DropdownMenu } from "@/components/ui/dropdown-menu";

function isInsideTarget(event: SyntheticEvent<HTMLElement>): boolean {
  return (
    event.target instanceof Node && event.currentTarget.contains(event.target)
  );
}

export function useContextActionsMenu(moveThreshold = 10) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{
    getBoundingClientRect: () => DOMRect;
  }>();
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const touchStart = useRef<{ x: number; y: number }>(undefined);
  const didLongPress = useRef(false);

  function cancelLongPress() {
    clearTimeout(longPressTimer.current);
    touchStart.current = undefined;
  }

  useEffect(() => () => clearTimeout(longPressTimer.current), []);

  function openMenuAt(x: number, y: number) {
    const point = new DOMRect(x, y, 0, 0);
    setMenuAnchor({ getBoundingClientRect: () => point });
    setMenuOpen(true);
  }

  const menuProps: ComponentProps<typeof DropdownMenu> = {
    modal: false,
    open: menuOpen,
    onOpenChange: (open, details) => {
      // Pointer-opened menus must not close when leaving the ellipsis trigger.
      if (details.reason === "trigger-hover") return;
      if (open) setMenuAnchor(undefined);
      setMenuOpen(open);
    },
  };
  const targetProps: HTMLAttributes<HTMLElement> = {
    onContextMenu: (event) => {
      if (!isInsideTarget(event)) return;
      event.preventDefault();
      cancelLongPress();
      openMenuAt(event.clientX, event.clientY);
    },
    onTouchStart: (event) => {
      if (!isInsideTarget(event)) return;
      cancelLongPress();
      didLongPress.current = false;
      if (event.touches.length !== 1) return;
      const { clientX: x, clientY: y } = event.touches[0];
      touchStart.current = { x, y };
      longPressTimer.current = setTimeout(() => {
        didLongPress.current = true;
        openMenuAt(x, y);
      }, 500);
    },
    onTouchMove: (event) => {
      const start = touchStart.current;
      if (!start) return;
      const touch = event.touches[0];
      if (
        event.touches.length !== 1 ||
        Math.hypot(touch.clientX - start.x, touch.clientY - start.y) >=
          moveThreshold
      ) {
        cancelLongPress();
      }
    },
    onPointerMove: (event) => {
      // A long press that opened a menu must not turn into dragging its row.
      if (menuOpen && isInsideTarget(event)) event.stopPropagation();
    },
    onTouchEnd: cancelLongPress,
    onTouchCancel: cancelLongPress,
    onClickCapture: (event) => {
      if (!didLongPress.current) return;
      didLongPress.current = false;
      if (isInsideTarget(event)) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    style: { WebkitTouchCallout: "none" },
  };
  return { menuProps, targetProps, anchor: menuAnchor };
}
