import type { ServerChannel, ServerChannelKind } from "@runelink/sdk";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ChannelActionsMenu } from "@/components/sidebar/ChannelActionsMenu";
import { cn } from "@/lib/utils";

type CategoryListItemProps = {
  host: string;
  serverId: string;
  channel: ServerChannel;
  isCollapsed: boolean;
  canManageChannels: boolean;
  onToggleCollapsed: (channel: ServerChannel) => void;
  onCreateChild: (kind: ServerChannelKind) => void;
  onDeleteChannel: (channel: ServerChannel) => void;
};

export function CategoryListItem({
  host,
  serverId,
  channel,
  isCollapsed,
  canManageChannels,
  onToggleCollapsed,
  onCreateChild,
  onDeleteChannel,
}: CategoryListItemProps) {
  const Chevron = isCollapsed ? ChevronRight : ChevronDown;

  return (
    <div className="group relative rounded-xl">
      <button
        type="button"
        className={cn(
          "flex w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-xl px-2 pt-3 pb-1.5 pr-12 text-left",
          "text-sm font-medium text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground",
          "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
        )}
        aria-expanded={!isCollapsed}
        onClick={() => {
          onToggleCollapsed(channel);
        }}
      >
        <Chevron className="size-3.5 shrink-0" />
        <span className="truncate">{channel.title}</span>
      </button>

      <ChannelActionsMenu
        host={host}
        serverId={serverId}
        channel={channel}
        canDeleteChannel={canManageChannels}
        className="absolute right-2 bottom-0"
        onDeleteChannel={onDeleteChannel}
        onCreateChild={canManageChannels ? onCreateChild : undefined}
      />
    </div>
  );
}
