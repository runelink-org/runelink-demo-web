import type { Server } from "@runelink/sdk";
import { Plus, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { useContextActionsMenu } from "@/lib/use-context-actions-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreateServerDialog } from "./CreateServerDialog";
import { JoinServerDialog } from "./JoinServerDialog";

type AddServerMenuProps = {
  contextMenu: ReturnType<typeof useContextActionsMenu>;
  activeHost: string | null;
  joinedServerIds: Set<string>;
  onCreateServer: (
    host: string,
    title: string,
    description: string
  ) => Promise<void>;
  onSearchServers: (host: string) => Promise<Server[]>;
  onJoinServer: (serverId: string, serverHost: string) => Promise<void>;
};

export function AddServerMenu({
  contextMenu,
  activeHost,
  joinedServerIds,
  onCreateServer,
  onSearchServers,
  onJoinServer,
}: AddServerMenuProps) {
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const isMenuOpen = contextMenu.menuProps.open;
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isJoinDialogOpen, setIsJoinDialogOpen] = useState(false);
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

  useEffect(() => {
    if (!isTooltipVisible) {
      return;
    }

    function updateTooltipPosition() {
      const rect = triggerRef.current?.getBoundingClientRect();
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
    if (isMenuOpen) {
      return;
    }

    const rect = triggerRef.current?.getBoundingClientRect();
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
      <DropdownMenu {...contextMenu.menuProps}>
        <DropdownMenuTrigger
          {...contextMenu.targetProps}
          render={<button type="button" />}
        >
          <span
            ref={triggerRef}
            className="flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-2xl border border-dashed border-sidebar-border bg-sidebar-accent/45 text-sidebar-foreground/70 transition hover:border-primary/40 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            aria-label="Add server"
            onMouseEnter={showTooltip}
            onMouseLeave={hideTooltip}
          >
            <Plus className="size-5" />
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          anchor={contextMenu.anchor}
          side={contextMenu.anchor ? "bottom" : "right"}
          align={contextMenu.anchor ? "start" : "end"}
          sideOffset={contextMenu.anchor ? 0 : 10}
          className={contextMenu.anchor ? "w-56" : "w-56 rounded-2xl p-2"}
        >
          <DropdownMenuItem
            className="cursor-pointer gap-3 rounded-xl px-3 py-2"
            onClick={() => {
              setIsCreateDialogOpen(true);
            }}
          >
            <Plus className="size-4" />
            <div className="flex flex-col">
              <span className="font-medium">Create server</span>
              {!contextMenu.anchor ? (
                <span className="text-xs text-muted-foreground">
                  Start a new server.
                </span>
              ) : null}
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer gap-3 rounded-xl px-3 py-2"
            onClick={() => {
              setIsJoinDialogOpen(true);
            }}
          >
            <Search className="size-4" />
            <div className="flex flex-col">
              <span className="font-medium">Join server</span>
              {!contextMenu.anchor ? (
                <span className="text-xs text-muted-foreground">
                  Look up existing servers.
                </span>
              ) : null}
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {isTooltipVisible &&
      !isMenuOpen &&
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
                Create/Join Server
              </p>
            </div>,
            document.body
          )
        : null}

      <CreateServerDialog
        activeHost={activeHost}
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onCreateServer={onCreateServer}
      />

      <JoinServerDialog
        open={isJoinDialogOpen}
        activeHost={activeHost}
        joinedServerIds={joinedServerIds}
        onOpenChange={setIsJoinDialogOpen}
        onSearchServers={onSearchServers}
        onJoinServer={onJoinServer}
      />
    </>
  );
}
