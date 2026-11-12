import type { ServerChannel } from "@runelink/sdk";
import { Hash } from "lucide-react";
import { useEffect, useRef } from "react";
import { ChannelActionsMenu } from "@/components/sidebar/ChannelActionsMenu";
import { NavigationLink } from "@/components/NavigationLink";
import { buttonVariants } from "@/components/ui/button";
import { getAppRoutePath } from "@/lib/app-route";
import { useContextActionsMenu } from "@/lib/use-context-actions-menu";
import { cn } from "@/lib/utils";
import { getActiveAccount, useAuthStore } from "@/lib/auth-store";
import { sameUserRef } from "@/lib/account-storage";
import { useMessagesStore } from "@/lib/messages-store";
import { useRunelinkConnectionStore } from "@/lib/runelink-connection-store";

const PREFETCH_DELAY_MS = 150;

type ChannelListItemProps = {
  host: string;
  channel: ServerChannel;
  isSelected: boolean;
  canDeleteChannel: boolean;
  onSelect: (channel: ServerChannel) => void;
  onDeleteChannel: (channel: ServerChannel) => void;
  onEditChannel: (channel: ServerChannel) => void;
};

export function ChannelListItem({
  host,
  channel,
  isSelected,
  canDeleteChannel,
  onSelect,
  onDeleteChannel,
  onEditChannel,
}: ChannelListItemProps) {
  // Cancel the long press as soon as the tree starts a drag at 5px.
  const contextMenu = useContextActionsMenu(5);
  const prefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function cancelPrefetch() {
    if (prefetchTimer.current !== null) {
      clearTimeout(prefetchTimer.current);
      prefetchTimer.current = null;
    }
  }
  useEffect(() => cancelPrefetch, [channel.id, host]);

  function prefetch() {
    cancelPrefetch();
    const account = getActiveAccount(useAuthStore.getState());
    const connection = useRunelinkConnectionStore.getState();
    if (
      channel.kind !== "text" ||
      !account ||
      connection.status !== "connected" ||
      !sameUserRef(account, connection.connectedAccount)
    )
      return;

    void useMessagesStore
      .getState()
      .fetchMessagesByTextChannel(
        channel.text_channel_id,
        host === account.host ? null : host
      )
      .catch(() => {
        // Opening the channel retries a failed background fetch.
      });
  }
  return (
    <div
      {...contextMenu.targetProps}
      className={cn(
        "group relative rounded-2xl border transition-colors",
        isSelected
          ? "border-sidebar-border/70 bg-primary/12 shadow-sm dark:border-sidebar-border dark:bg-muted"
          : "border-transparent hover:bg-primary/6 dark:hover:bg-muted/60"
      )}
    >
      <NavigationLink
        href={getAppRoutePath({
          screen: "channel",
          serverId: channel.server_id,
          channelId: channel.id,
        })}
        aria-current={isSelected ? "page" : undefined}
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "h-auto w-full min-w-0 cursor-pointer justify-start rounded-2xl px-3 py-3 text-left transition-colors group-hover:pr-10 group-has-[[data-slot=dropdown-menu-trigger]:focus-visible]:pr-10 hover:bg-transparent dark:hover:bg-transparent",
          isSelected
            ? "text-foreground dark:text-sidebar-foreground"
            : "text-sidebar-foreground/80 hover:text-sidebar-foreground"
        )}
        onNavigate={() => {
          cancelPrefetch();
          onSelect(channel);
        }}
        onPointerEnter={(event) => {
          if (event.pointerType !== "mouse") return;
          cancelPrefetch();
          prefetchTimer.current = setTimeout(prefetch, PREFETCH_DELAY_MS);
        }}
        onPointerLeave={cancelPrefetch}
        onPointerDown={cancelPrefetch}
        onFocus={(event) => {
          if (event.currentTarget.matches(":focus-visible")) prefetch();
        }}
        onBlur={cancelPrefetch}
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
      </NavigationLink>

      <ChannelActionsMenu
        contextMenu={contextMenu}
        host={host}
        channel={channel}
        canDeleteChannel={canDeleteChannel}
        className="absolute top-1/2 right-2 -translate-y-1/2"
        onDeleteChannel={onDeleteChannel}
        onEditChannel={onEditChannel}
      />
    </div>
  );
}
