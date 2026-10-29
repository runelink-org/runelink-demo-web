import type { ServerChannel, ServerChannelKind } from "@runelink/sdk";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ChannelActionsMenu } from "@/components/sidebar/ChannelActionsMenu";
import { useContextActionsMenu } from "@/lib/use-context-actions-menu";
import { cn } from "@/lib/utils";

type CategoryListItemProps = {
  host: string;
  channel: ServerChannel;
  isCollapsed: boolean;
  canManageChannels: boolean;
  onToggleCollapsed: () => void;
  onCreateChild: (kind: ServerChannelKind) => void;
  onDeleteChannel: (channel: ServerChannel) => void;
  onEditChannel: (channel: ServerChannel) => void;
};

export function CategoryListItem({
  host,
  channel,
  isCollapsed,
  canManageChannels,
  onToggleCollapsed,
  onCreateChild,
  onDeleteChannel,
  onEditChannel,
}: CategoryListItemProps) {
  // Cancel the long press as soon as the tree starts a drag at 5px.
  const contextMenu = useContextActionsMenu(5);
  const Chevron = isCollapsed ? ChevronRight : ChevronDown;

  return (
    <div {...contextMenu.targetProps} className="group relative rounded-xl">
      <button
        type="button"
        className={cn(
          "flex w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-xl px-2 pt-3 pb-1.5 text-left group-hover:pr-10 group-has-[[data-slot=dropdown-menu-trigger]:focus-visible]:pr-10",
          "text-sm font-medium text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground",
          "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
        )}
        aria-expanded={!isCollapsed}
        onClick={onToggleCollapsed}
      >
        <Chevron className="size-3.5 shrink-0" />
        <span className="truncate">{channel.title}</span>
      </button>

      <ChannelActionsMenu
        contextMenu={contextMenu}
        host={host}
        channel={channel}
        canDeleteChannel={canManageChannels}
        className="absolute right-2 bottom-0"
        onDeleteChannel={onDeleteChannel}
        onEditChannel={onEditChannel}
        onCreateChild={canManageChannels ? onCreateChild : undefined}
      />
    </div>
  );
}
