import type { Channel } from "@runelink/sdk";
import { Hash } from "lucide-react";
import { ChannelActionsMenu } from "@/components/sidebar/ChannelActionsMenu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ChannelListItemProps = {
  channel: Channel;
  isSelected: boolean;
  canDeleteChannel: boolean;
  onSelect: (channel: Channel) => void;
  onDeleteChannel: (channel: Channel) => void;
};

export function ChannelListItem({
  channel,
  isSelected,
  canDeleteChannel,
  onSelect,
  onDeleteChannel,
}: ChannelListItemProps) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-2xl pr-2 transition",
        isSelected ? "bg-primary/12" : "hover:bg-sidebar-accent"
      )}
    >
      <Button
        variant="ghost"
        className={cn(
          "h-auto min-w-0 flex-1 cursor-pointer justify-start rounded-2xl px-3 py-3 text-left",
          isSelected
            ? "text-foreground hover:bg-transparent"
            : "text-sidebar-foreground/80 hover:bg-transparent hover:text-sidebar-foreground"
        )}
        onClick={() => {
          onSelect(channel);
        }}
      >
        <div className="flex min-w-0 items-start gap-3">
          <Hash className="mt-0.5 size-4 shrink-0 text-sidebar-foreground/50" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{channel.title}</p>
          </div>
        </div>
      </Button>

      <ChannelActionsMenu
        channel={channel}
        canDeleteChannel={canDeleteChannel}
        onDeleteChannel={onDeleteChannel}
      />
    </div>
  );
}
