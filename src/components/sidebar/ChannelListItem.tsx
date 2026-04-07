import type { Channel } from "@runelink/sdk";
import { Hash } from "lucide-react";
import { ChannelActionsMenu } from "@/components/sidebar/ChannelActionsMenu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ChannelListItemProps = {
  host: string;
  serverId: string;
  channel: Channel;
  isSelected: boolean;
  canDeleteChannel: boolean;
  onSelect: (channel: Channel) => void;
  onDeleteChannel: (channel: Channel) => void;
};

export function ChannelListItem({
  host,
  serverId,
  channel,
  isSelected,
  canDeleteChannel,
  onSelect,
  onDeleteChannel,
}: ChannelListItemProps) {
  return (
    <div
      className={cn(
        "group relative rounded-2xl border transition-colors",
        isSelected
          ? "border-sidebar-border/70 bg-primary/12 shadow-sm dark:border-sidebar-border dark:bg-sidebar-accent/80"
          : "border-transparent hover:bg-sidebar-accent/70"
      )}
    >
      <Button
        variant="ghost"
        className={cn(
          "h-auto w-full min-w-0 cursor-pointer justify-start rounded-2xl px-3 py-3 pr-12 text-left",
          isSelected
            ? "text-foreground hover:bg-transparent dark:text-sidebar-foreground"
            : "text-sidebar-foreground/80 hover:bg-transparent hover:text-sidebar-foreground"
        )}
        onClick={() => {
          onSelect(channel);
        }}
      >
        <div className="flex min-w-0 items-start gap-3">
          <Hash
            className={cn(
              "mt-0.5 size-4 shrink-0",
              isSelected
                ? "text-primary/75 dark:text-sidebar-foreground/80"
                : "text-sidebar-foreground/50"
            )}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{channel.title}</p>
          </div>
        </div>
      </Button>

      <ChannelActionsMenu
        host={host}
        serverId={serverId}
        channel={channel}
        canDeleteChannel={canDeleteChannel}
        className="absolute top-1/2 right-2 -translate-y-1/2"
        onDeleteChannel={onDeleteChannel}
      />
    </div>
  );
}
