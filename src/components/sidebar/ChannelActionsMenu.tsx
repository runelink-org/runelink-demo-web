import type { ServerChannel, ServerChannelKind } from "@runelink/sdk";
import { Copy, Ellipsis, FolderPlus, Hash, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatChannelCliPath } from "@/lib/cli-path";
import { cn } from "@/lib/utils";

type ChannelActionsMenuProps = {
  host: string;
  serverId: string;
  channel: ServerChannel;
  canDeleteChannel: boolean;
  onDeleteChannel: (channel: ServerChannel) => void;
  // Passed for categories when the user can create channels
  onCreateChild?: (kind: ServerChannelKind) => void;
  className?: string;
  forceVisible?: boolean;
};

export function ChannelActionsMenu({
  host,
  serverId,
  channel,
  canDeleteChannel,
  onDeleteChannel,
  onCreateChild,
  className,
  forceVisible = false,
}: ChannelActionsMenuProps) {
  const isCategory = channel.kind === "category";
  async function handleCopyChannelId(channelId: string) {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      toast.error("Clipboard is not available.");
      return;
    }

    try {
      await navigator.clipboard.writeText(channelId);
      toast.success(`Copied channel ID: ${channelId}`);
    } catch {
      toast.error("Failed to copy channel ID.");
    }
  }

  async function handleCopyChannelCliPath(
    host: string,
    serverId: string,
    channelId: string
  ) {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      toast.error("Clipboard is not available.");
      return;
    }

    try {
      await navigator.clipboard.writeText(
        formatChannelCliPath(host, serverId, channelId)
      );
      toast.success("Copied CLI path.");
    } catch {
      toast.error("Failed to copy CLI path.");
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className={cn(
              "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-xl text-sidebar-foreground/55 transition",
              forceVisible
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100",
              "hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              className
            )}
            aria-label={`Open ${channel.title} menu`}
          />
        }
      >
        <Ellipsis className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="bottom"
        sideOffset={8}
        className="w-64"
      >
        {onCreateChild ? (
          <>
            <DropdownMenuItem
              className="cursor-pointer gap-3 rounded-xl px-3 py-2"
              onClick={() => {
                onCreateChild("text");
              }}
            >
              <Hash className="size-4" />
              <span className="font-medium">Create channel</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer gap-3 rounded-xl px-3 py-2"
              onClick={() => {
                onCreateChild("category");
              }}
            >
              <FolderPlus className="size-4" />
              <span className="font-medium">Create category</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem
          className="cursor-pointer gap-3 rounded-xl px-3 py-2"
          onClick={() => {
            void handleCopyChannelId(channel.id);
          }}
        >
          <Copy className="size-4" />
          <span className="font-medium">Copy channel ID</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer gap-3 rounded-xl px-3 py-2"
          onClick={() => {
            void handleCopyChannelCliPath(host, serverId, channel.id);
          }}
        >
          <Copy className="size-4" />
          <span className="font-medium">Copy path for CLI</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          disabled={!canDeleteChannel}
          className="cursor-pointer gap-3 rounded-xl px-3 py-2"
          onClick={() => {
            if (!canDeleteChannel) {
              return;
            }

            onDeleteChannel(channel);
          }}
        >
          <Trash2 className="size-4" />
          <span className="font-medium">
            {isCategory ? "Delete category" : "Delete channel"}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
