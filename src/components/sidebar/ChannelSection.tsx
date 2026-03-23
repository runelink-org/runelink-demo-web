import type { Channel, ServerWithChannels } from "@runelink/sdk";
import { Plus } from "lucide-react";
import { ChannelListItem } from "@/components/sidebar/ChannelListItem";
import { Button } from "@/components/ui/button";

type ChannelSectionProps = {
  selectedServer: ServerWithChannels | null;
  selectedChannelId: string | null;
  isLoading: boolean;
  error: string | null;
  isSelectedServerHydrating: boolean;
  canCreateChannel: boolean;
  canDeleteSelectedServer: boolean;
  onOpenCreateChannel: () => void;
  onSelectChannel: (serverId: string, channel: Channel) => void;
  onDeleteChannel: (channel: Channel) => void;
};

export function ChannelSection({
  selectedServer,
  selectedChannelId,
  isLoading,
  error,
  isSelectedServerHydrating,
  canCreateChannel,
  canDeleteSelectedServer,
  onOpenCreateChannel,
  onSelectChannel,
  onDeleteChannel,
}: ChannelSectionProps) {
  const createChannelTooltip = selectedServer
    ? canCreateChannel
      ? "Create channel"
      : "Only server admins can create channels."
    : "Select a server first.";

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
              onClick={onOpenCreateChannel}
              disabled={!selectedServer || !canCreateChannel}
              aria-label={createChannelTooltip}
            >
              <Plus className="size-4" />
            </Button>
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
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
        ) : selectedServer.channels.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-sidebar-border bg-sidebar-accent/50 px-4 py-3 text-sm text-sidebar-foreground/70">
            This server does not have any channels yet.
          </div>
        ) : (
          <div className="space-y-1">
            {selectedServer.channels.map((channel) => (
              <ChannelListItem
                key={channel.id}
                channel={channel}
                isSelected={channel.id === selectedChannelId}
                canDeleteChannel={canDeleteSelectedServer}
                onSelect={(nextChannel) => {
                  onSelectChannel(selectedServer.server.id, nextChannel);
                }}
                onDeleteChannel={onDeleteChannel}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
