import type { Server } from "@runelink/sdk";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getServerMonogram } from "@/components/sidebar/server-display";
import { cn } from "@/lib/utils";

type ServerRailButtonProps = {
  isSelected: boolean;
  server: Server;
  onSelect: (serverId: string) => void;
};

type TooltipPosition = {
  top: number;
  left: number;
};

export function ServerRailButton({
  isSelected,
  server,
  onSelect,
}: ServerRailButtonProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] =
    useState<TooltipPosition | null>(null);

  useEffect(() => {
    if (!isTooltipVisible) {
      return;
    }

    function updateTooltipPosition() {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      setTooltipPosition({
        top: rect.top + rect.height / 2,
        left: rect.right + 12,
      });
    }

    updateTooltipPosition();

    window.addEventListener("scroll", updateTooltipPosition, true);
    window.addEventListener("resize", updateTooltipPosition);

    return () => {
      window.removeEventListener("scroll", updateTooltipPosition, true);
      window.removeEventListener("resize", updateTooltipPosition);
    };
  }, [isTooltipVisible]);

  function showTooltip() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    setTooltipPosition({
      top: rect.top + rect.height / 2,
      left: rect.right + 12,
    });
    setIsTooltipVisible(true);
  }

  function hideTooltip() {
    setIsTooltipVisible(false);
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={cn(
          "group relative flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-2xl border text-sm font-semibold transition",
          isSelected
            ? "border-primary/30 bg-primary text-primary-foreground"
            : "border-sidebar-border bg-sidebar-accent text-sidebar-foreground hover:border-sidebar-foreground/35 hover:bg-sidebar-accent/80"
        )}
        onClick={() => onSelect(server.id)}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        aria-pressed={isSelected}
      >
        <span
          className="pointer-events-none absolute -left-2 h-6 w-1 rounded-full bg-primary opacity-0 transition group-hover:opacity-60 data-[selected=true]:opacity-100"
          data-selected={isSelected}
        />
        {getServerMonogram(server.title)}
      </button>

      {isTooltipVisible && tooltipPosition && typeof document !== "undefined"
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[100] rounded-xl border border-sidebar-border/80 bg-sidebar px-4 py-3 shadow-lg shadow-black/8"
              style={{
                top: tooltipPosition.top,
                left: tooltipPosition.left,
                transform: "translateY(-50%)",
              }}
            >
              <p className="whitespace-nowrap text-sm font-medium text-sidebar-foreground">
                {server.title}
              </p>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
