import type {
  ServerChannel,
  ServerChannelKind,
  ServerChannelMove,
  ServerWithChannels,
} from "@runelink/sdk";
import { FolderPlus, Hash, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { CategoryListItem } from "@/components/sidebar/CategoryListItem";
import { ChannelListItem } from "@/components/sidebar/ChannelListItem";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useContextActionsMenu } from "@/lib/use-context-actions-menu";
import {
  ancestorIds,
  type ChannelRow,
  type DropTarget,
  planDrop,
  visibleRows,
} from "@/lib/channel-tree";
import { cn } from "@/lib/utils";

const INDENT_PX = 14;
// How far a pressed pointer moves before a click becomes a drag
const DRAG_THRESHOLD_PX = 5;

type ChannelSectionProps = {
  selectedServer: ServerWithChannels | null;
  selectedChannelId: string | null;
  isLoading: boolean;
  error: string | null;
  isSelectedServerHydrating: boolean;
  canManageChannels: boolean;
  onOpenCreateChannel: (
    kind: ServerChannelKind,
    parentChannelId: string | null
  ) => void;
  onSelectChannel: (serverId: string, channel: ServerChannel) => void;
  onDeleteChannel: (channel: ServerChannel) => void;
  onMoveChannel: (
    channel: ServerChannel,
    channelMove: ServerChannelMove
  ) => Promise<void>;
};

type DragState = {
  channelId: string;
  target: DropTarget | null;
};

type PressState = {
  channelId: string;
  pointerId: number;
  startX: number;
  startY: number;
};

// Where a pointer would drop
function dropTargetAt(
  channels: ServerChannel[],
  rows: ChannelRow[],
  draggedId: string,
  clientX: number,
  clientY: number
): DropTarget | null {
  const element = document.elementFromPoint(clientX, clientY);
  const row = element?.closest<HTMLElement>("[data-channel-row]");
  if (!row) {
    // Rows are contiguous, so the rest of the tree is the space below them
    return element?.closest("[data-channel-tree]")
      ? { channelId: null, placement: "root-end" }
      : null;
  }
  const channel = channels.find((c) => c.id === row.dataset.channelRow);
  if (!channel) {
    return null;
  }

  const rect = row.getBoundingClientRect();
  const fraction = (clientY - rect.top) / rect.height;
  let target: DropTarget;
  if (channel.kind === "category") {
    // Below an expanded category, its first child is the next drop target
    const hasVisibleChildren = rows.some(
      (r) => r.channel.parent_channel_id === channel.id
    );
    const placement =
      fraction < 0.3
        ? "before"
        : fraction > 0.7 && !hasVisibleChildren
          ? "after"
          : "inside";
    target = { channelId: channel.id, placement };
  } else {
    target = {
      channelId: channel.id,
      placement: fraction < 0.5 ? "before" : "after",
    };
  }

  return planDrop(channels, draggedId, target) ? target : null;
}

export function ChannelSection({
  selectedServer,
  selectedChannelId,
  isLoading,
  error,
  isSelectedServerHydrating,
  canManageChannels,
  onOpenCreateChannel,
  onSelectChannel,
  onDeleteChannel,
  onMoveChannel,
}: ChannelSectionProps) {
  const backgroundMenu = useContextActionsMenu();

  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [drag, setDrag] = useState<DragState | null>(null);
  const [revealedChannelId, setRevealedChannelId] = useState<string | null>(
    null
  );
  // A pressed row that hasn't moved far enough to drag yet
  const pressRef = useRef<PressState | null>(null);
  // Set when a drag ends, so the click that follows doesn't select the row
  const suppressClickRef = useRef(false);
  const channels = selectedServer?.channels ?? [];
  const rows = visibleRows(channels, collapsedIds, selectedChannelId);

  // Expand the categories containing a newly selected channel, such as one
  // just created in a collapsed category
  if (selectedChannelId !== revealedChannelId) {
    setRevealedChannelId(selectedChannelId);
    if (selectedChannelId) {
      const ancestors = ancestorIds(channels, selectedChannelId);
      setCollapsedIds((current) =>
        ancestors.some((id) => current.has(id))
          ? new Set([...current].filter((id) => !ancestors.includes(id)))
          : current
      );
    }
  }

  const createChannelTooltip = canManageChannels
    ? "Create channel"
    : "Only server admins can create channels.";

  function toggleCollapsed(channel: ServerChannel, isCollapsed: boolean) {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (isCollapsed) {
        // A category shown collapsed by a collapsed ancestor expands with it
        for (const id of [channel.id, ...ancestorIds(channels, channel.id)]) {
          next.delete(id);
        }
      } else {
        next.add(channel.id);
      }
      return next;
    });
  }

  function handlePointerDown(
    event: React.PointerEvent<HTMLDivElement>,
    channel: ServerChannel
  ) {
    suppressClickRef.current = false;
    if (
      !canManageChannels ||
      event.button !== 0 ||
      // Pressing the actions menu opens it rather than dragging
      (event.target as Element).closest("[aria-haspopup]")
    ) {
      return;
    }
    pressRef.current = {
      channelId: channel.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    let channelId = drag?.channelId;
    if (!channelId) {
      const press = pressRef.current;
      if (
        !press ||
        press.pointerId !== event.pointerId ||
        Math.hypot(event.clientX - press.startX, event.clientY - press.startY) <
          DRAG_THRESHOLD_PX
      ) {
        return;
      }
      channelId = press.channelId;
      pressRef.current = null;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const target = dropTargetAt(
      channels,
      rows,
      channelId,
      event.clientX,
      event.clientY
    );
    if (
      !drag ||
      target?.channelId !== drag.target?.channelId ||
      target?.placement !== drag.target?.placement
    ) {
      setDrag({ channelId, target });
    }
  }

  function handlePointerUp() {
    pressRef.current = null;
    if (!drag) {
      return;
    }
    setDrag(null);
    suppressClickRef.current = true;

    const channel = channels.find((c) => c.id === drag.channelId);
    const channelMove =
      drag.target && planDrop(channels, drag.channelId, drag.target);
    if (!channel || !channelMove) {
      return;
    }
    const parentId = channelMove.parent_channel_id;
    if (parentId) {
      // Reveal the moved channel in its new category
      setCollapsedIds((current) => {
        const next = new Set(current);
        next.delete(parentId);
        return next;
      });
    }
    onMoveChannel(channel, channelMove).catch((moveError: unknown) => {
      toast.error(
        moveError instanceof Error
          ? moveError.message
          : `Failed to move ${channel.title}.`
      );
    });
  }

  return (
    <div
      {...backgroundMenu.targetProps}
      onContextMenu={(event) => {
        if (selectedServer) backgroundMenu.targetProps.onContextMenu?.(event);
      }}
      onTouchStart={(event) => {
        if (selectedServer) backgroundMenu.targetProps.onTouchStart?.(event);
      }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div
        className="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-9"
        data-channel-tree
        data-sidebar-scroll
      >
        {error ? (
          <div className="rounded-2xl border border-destructive/15 bg-destructive/5 px-4 py-3 text-sm text-sidebar-foreground/80">
            {error}
          </div>
        ) : isLoading ? (
          <div className="rounded-2xl border border-sidebar-border/70 bg-sidebar-accent/70 px-4 py-3 text-sm text-sidebar-foreground/70">
            Loading servers and channels...
          </div>
        ) : !selectedServer ? (
          <div className="rounded-2xl border border-dashed border-sidebar-border bg-sidebar-accent/50 px-4 py-3 text-sm text-sidebar-foreground/70">
            Pick a server to see its channels.
          </div>
        ) : isSelectedServerHydrating ? (
          <div className="rounded-2xl border border-sidebar-border/70 bg-sidebar-accent/70 px-4 py-3 text-sm text-sidebar-foreground/70">
            Loading channels...
          </div>
        ) : channels.length === 0 ? (
          <div className="flex items-center justify-between gap-2 px-2">
            <p className="text-sm text-sidebar-foreground/70">Add channel</p>
            <span className="inline-flex" title={createChannelTooltip}>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-7 rounded-xl text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                onClick={() => onOpenCreateChannel("text", null)}
                disabled={!canManageChannels}
                aria-label={createChannelTooltip}
              >
                <Plus className="size-4" />
              </Button>
            </span>
          </div>
        ) : (
          <div className="relative" role="tree">
            {rows.map(({ channel, depth, isCollapsed }) => {
              const indentPx = depth * INDENT_PX;
              const isDragged = drag?.channelId === channel.id;
              const placement =
                drag?.target?.channelId === channel.id
                  ? drag.target.placement
                  : null;

              return (
                <div
                  key={channel.id}
                  role="treeitem"
                  data-channel-row={channel.id}
                  className={cn(
                    "relative rounded-2xl py-0.5",
                    canManageChannels && "select-none",
                    isDragged && "cursor-grabbing opacity-50",
                    placement === "inside" &&
                      "bg-primary/10 ring-2 ring-primary/40"
                  )}
                  style={{ paddingLeft: indentPx }}
                  onPointerDown={(event) => {
                    handlePointerDown(event, channel);
                  }}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={() => {
                    pressRef.current = null;
                  }}
                  onLostPointerCapture={() => {
                    setDrag(null);
                  }}
                  onClickCapture={(event) => {
                    if (suppressClickRef.current) {
                      suppressClickRef.current = false;
                      event.preventDefault();
                      event.stopPropagation();
                    }
                  }}
                >
                  {placement === "before" || placement === "after" ? (
                    <div
                      aria-hidden
                      className={cn(
                        "pointer-events-none absolute right-1 z-10 h-0.5 rounded-full bg-primary",
                        placement === "before" ? "-top-px" : "-bottom-px"
                      )}
                      style={{ left: indentPx }}
                    />
                  ) : null}

                  {channel.kind === "category" ? (
                    <CategoryListItem
                      host={selectedServer.server.host}
                      channel={channel}
                      isCollapsed={isCollapsed}
                      canManageChannels={canManageChannels}
                      onToggleCollapsed={() => {
                        toggleCollapsed(channel, isCollapsed);
                      }}
                      onCreateChild={(kind) => {
                        onOpenCreateChannel(kind, channel.id);
                      }}
                      onDeleteChannel={onDeleteChannel}
                    />
                  ) : (
                    <ChannelListItem
                      host={selectedServer.server.host}
                      channel={channel}
                      isSelected={channel.id === selectedChannelId}
                      canDeleteChannel={canManageChannels}
                      onSelect={(nextChannel) => {
                        onSelectChannel(selectedServer.server.id, nextChannel);
                      }}
                      onDeleteChannel={onDeleteChannel}
                    />
                  )}
                </div>
              );
            })}
            {drag?.target?.placement === "root-end" ? (
              <div
                aria-hidden
                className="pointer-events-none absolute right-1 -bottom-px left-0 h-0.5 rounded-full bg-primary"
              />
            ) : null}
          </div>
        )}
      </div>
      <DropdownMenu {...backgroundMenu.menuProps}>
        <DropdownMenuContent
          anchor={backgroundMenu.anchor}
          align="start"
          sideOffset={0}
          className="w-64"
        >
          <DropdownMenuItem
            className="cursor-pointer gap-3 rounded-xl px-3 py-2"
            disabled={!canManageChannels}
            onClick={() => onOpenCreateChannel("text", null)}
          >
            <Hash className="size-4" />
            <span className="font-medium">Create channel</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer gap-3 rounded-xl px-3 py-2"
            disabled={!canManageChannels}
            onClick={() => onOpenCreateChannel("category", null)}
          >
            <FolderPlus className="size-4" />
            <span className="font-medium">Create category</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
