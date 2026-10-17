import type {
  ServerChannel,
  ServerChannelKind,
  ServerChannelMove,
  ServerWithChannels,
} from "@runelink/sdk";
import { GripVertical, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CategoryListItem } from "@/components/sidebar/CategoryListItem";
import { ChannelListItem } from "@/components/sidebar/ChannelListItem";
import { Button } from "@/components/ui/button";
import {
  ancestorIds,
  type DropTarget,
  planDrop,
  visibleRows,
} from "@/lib/channel-tree";
import { useReorderModifierHeld } from "@/lib/use-reorder-modifier";
import { cn } from "@/lib/utils";

const INDENT_PX = 14;
const HANDLE_GUTTER_PX = 16;

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

// Where a pointer would drop
function dropTargetAt(
  channels: ServerChannel[],
  collapsedIds: ReadonlySet<string>,
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
    const hasVisibleChildren =
      !collapsedIds.has(channel.id) &&
      channels.some((c) => c.parent_channel_id === channel.id);
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
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [drag, setDrag] = useState<DragState | null>(null);
  const [revealedChannelId, setRevealedChannelId] = useState<string | null>(
    null
  );
  const isModifierHeld = useReorderModifierHeld();
  const channels = selectedServer?.channels ?? [];
  const rows = visibleRows(channels, collapsedIds);
  const showHandles = canManageChannels && (isModifierHeld || drag !== null);
  const gutterPx = canManageChannels ? HANDLE_GUTTER_PX : 0;

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

  const createChannelTooltip = selectedServer
    ? canManageChannels
      ? "Create channel"
      : "Only server admins can create channels."
    : "Select a server first.";

  function toggleCollapsed(channel: ServerChannel) {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (!next.delete(channel.id)) {
        next.add(channel.id);
      }
      return next;
    });
  }

  function handlePointerDown(
    event: React.PointerEvent<HTMLButtonElement>,
    channel: ServerChannel
  ) {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ channelId: channel.id, target: null });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    if (!drag) {
      return;
    }
    const target = dropTargetAt(
      channels,
      collapsedIds,
      drag.channelId,
      event.clientX,
      event.clientY
    );
    if (
      target?.channelId !== drag.target?.channelId ||
      target?.placement !== drag.target?.placement
    ) {
      setDrag({ ...drag, target });
    }
  }

  function handlePointerUp() {
    if (!drag) {
      return;
    }
    setDrag(null);

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
    <div className="flex min-h-0 flex-1 flex-col px-3 py-3">
      <div className="mb-2 px-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold tracking-[0.2em] text-sidebar-foreground/55 uppercase">
            Channels
          </p>
          <span className="inline-flex" title={createChannelTooltip}>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7 rounded-xl text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              onClick={() => {
                onOpenCreateChannel("text", null);
              }}
              disabled={!selectedServer || !canManageChannels}
              aria-label={createChannelTooltip}
            >
              <Plus className="size-4" />
            </Button>
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-6" data-channel-tree>
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
          <div className="rounded-2xl border border-dashed border-sidebar-border bg-sidebar-accent/50 px-4 py-3 text-sm text-sidebar-foreground/70">
            This server does not have any channels yet.
          </div>
        ) : (
          <div className="relative" role="tree">
            {rows.map(({ channel, depth }) => {
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
                    isDragged && "opacity-50",
                    placement === "inside" &&
                      "bg-primary/10 ring-2 ring-primary/40"
                  )}
                  style={{ paddingLeft: indentPx + gutterPx }}
                >
                  {placement === "before" || placement === "after" ? (
                    <div
                      aria-hidden
                      className={cn(
                        "pointer-events-none absolute right-1 z-10 h-0.5 rounded-full bg-primary",
                        placement === "before" ? "-top-px" : "-bottom-px"
                      )}
                      style={{ left: indentPx + gutterPx }}
                    />
                  ) : null}

                  {showHandles ? (
                    <button
                      type="button"
                      className={cn(
                        "absolute top-1/2 z-10 flex h-8 -translate-y-1/2 touch-none items-center justify-center rounded-md text-sidebar-foreground/50 hover:text-sidebar-foreground",
                        drag ? "cursor-grabbing" : "cursor-grab"
                      )}
                      style={{ left: indentPx, width: HANDLE_GUTTER_PX }}
                      aria-label={`Drag to move ${channel.title}`}
                      onPointerDown={(event) => {
                        handlePointerDown(event, channel);
                      }}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onLostPointerCapture={() => {
                        setDrag(null);
                      }}
                      // Ctrl-click opens the context menu on macOS
                      onContextMenu={(event) => {
                        event.preventDefault();
                      }}
                    >
                      <GripVertical className="size-4" />
                    </button>
                  ) : null}

                  {channel.kind === "category" ? (
                    <CategoryListItem
                      host={selectedServer.server.host}
                      serverId={selectedServer.server.id}
                      channel={channel}
                      isCollapsed={collapsedIds.has(channel.id)}
                      canManageChannels={canManageChannels}
                      onToggleCollapsed={toggleCollapsed}
                      onCreateChild={(kind) => {
                        onOpenCreateChannel(kind, channel.id);
                      }}
                      onDeleteChannel={onDeleteChannel}
                    />
                  ) : (
                    <ChannelListItem
                      host={selectedServer.server.host}
                      serverId={selectedServer.server.id}
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
                className="pointer-events-none absolute right-1 -bottom-px h-0.5 rounded-full bg-primary"
                style={{ left: gutterPx }}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
