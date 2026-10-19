import type { Server, ServerChannelKind } from "@runelink/sdk";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getServerMonogram } from "@/components/sidebar/server-display";
import { ServerActionsMenu } from "@/components/sidebar/ServerActionsMenu";
import { useContextActionsMenu } from "@/lib/use-context-actions-menu";
import { cn } from "@/lib/utils";

type ServerRailButtonProps = {
  isSelected: boolean;
  server: Server;
  onSelect: (serverId: string) => void;
  onOpenServerSettings: (server: Server) => void;
  canCreateChannels: boolean;
  onCreateChannel: (server: Server, kind: ServerChannelKind) => void;
  onLeaveServer: (server: Server) => void;
};

type TooltipPosition = {
  top: number;
  left: number;
};

export function ServerRailButton({
  isSelected,
  server,
  onSelect,
  onOpenServerSettings,
  canCreateChannels,
  onCreateChannel,
  onLeaveServer,
}: ServerRailButtonProps) {
  const contextMenu = useContextActionsMenu();
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
    if (
      typeof window !== "undefined" &&
      !window.matchMedia("(hover: hover) and (pointer: fine)").matches
    ) {
      return;
    }

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
        {...contextMenu.targetProps}
        ref={buttonRef}
        type="button"
        className={cn(
          "group relative flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-2xl border text-sm font-semibold",
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
          className="pointer-events-none absolute -left-2 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-primary opacity-0 transition-[height,opacity] group-hover:opacity-60 data-[selected=true]:h-8 data-[selected=true]:opacity-100"
          data-selected={isSelected}
        />
        <span
          className={cn(
            "pointer-events-none select-none",
            isSelected ? "text-primary-foreground" : "text-sidebar-foreground"
          )}
        >
          {getServerMonogram(server.title)}
        </span>
      </button>

      <ServerActionsMenu
        contextOnly
        contextMenu={contextMenu}
        server={server}
        onOpenServerSettings={onOpenServerSettings}
        canCreateChannels={canCreateChannels}
        onCreateChannel={onCreateChannel}
        onLeaveServer={onLeaveServer}
      />

      {isTooltipVisible &&
      !contextMenu.menuProps.open &&
      tooltipPosition &&
      typeof document !== "undefined"
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
