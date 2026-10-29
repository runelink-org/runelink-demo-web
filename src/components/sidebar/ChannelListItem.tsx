import { useState } from "react";
import { InlineChannelRename } from "./InlineChannelRename";
import type { ServerChannel } from "@runelink/sdk";
import { Hash } from "lucide-react";
import { ChannelActionsMenu } from "@/components/sidebar/ChannelActionsMenu";
import { Button } from "@/components/ui/button";
import { useContextActionsMenu } from "@/lib/use-context-actions-menu";
import { cn } from "@/lib/utils";

type ChannelListItemProps = {
  host: string;
  channel: ServerChannel;
  isSelected: boolean;
  canDeleteChannel: boolean;
  onSelect: (channel: ServerChannel) => void;
  onDeleteChannel: (channel: ServerChannel) => void;
};

export function ChannelListItem({
  host,
  channel,
  isSelected,
  canDeleteChannel,
  onSelect,
  onDeleteChannel,
}: ChannelListItemProps) {
  const [renaming, setRenaming] = useState<ServerChannel | null>(null);
  // Cancel the long press as soon as the tree starts a drag at 5px.
  const contextMenu = useContextActionsMenu(5);
  return (
    <div
      {...(renaming ? {} : contextMenu.targetProps)}
      data-channel-renaming={renaming ? "" : undefined}
      onContextMenu={(event) => {
        if (renaming) event.stopPropagation();
        else contextMenu.targetProps.onContextMenu?.(event);
      }}
      onTouchStart={(event) => {
        if (renaming) event.stopPropagation();
        else contextMenu.targetProps.onTouchStart?.(event);
      }}
      className={cn(
        "group relative rounded-2xl border transition-colors",
        isSelected
          ? "border-sidebar-border/70 bg-primary/12 shadow-sm dark:border-sidebar-border dark:bg-muted"
          : "border-transparent hover:bg-primary/6 dark:hover:bg-muted/60",
        renaming && !isSelected && "bg-primary/6 dark:bg-muted/60"
      )}
    >
      {renaming ? (
        <div className="flex min-w-0 items-start gap-3 border border-transparent px-3 py-3 text-sidebar-foreground">
          <Hash
            className={cn(
              "mt-0.5 size-4 shrink-0",
              isSelected
                ? "text-primary/75 dark:text-sidebar-foreground/80"
                : "text-sidebar-foreground/50"
            )}
          />
          <InlineChannelRename
            channel={renaming}
            host={host}
            onClose={() => setRenaming(null)}
          />
        </div>
      ) : (
        <Button
          variant="ghost"
          className={cn(
            "h-auto w-full min-w-0 cursor-pointer justify-start rounded-2xl px-3 py-3 text-left transition-colors group-hover:pr-10 group-has-[[data-slot=dropdown-menu-trigger]:focus-visible]:pr-10 hover:bg-transparent dark:hover:bg-transparent",
            isSelected
              ? "text-foreground dark:text-sidebar-foreground"
              : "text-sidebar-foreground/80 hover:text-sidebar-foreground"
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
      )}
      {!renaming ? (
        <ChannelActionsMenu
          contextMenu={contextMenu}
          host={host}
          channel={channel}
          canDeleteChannel={canDeleteChannel}
          className="absolute top-1/2 right-2 -translate-y-1/2"
          onDeleteChannel={onDeleteChannel}
          onRename={setRenaming}
        />
      ) : null}
    </div>
  );
}
