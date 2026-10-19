import type { Server, ServerChannelKind } from "@runelink/sdk";
import { Cog, Copy, Ellipsis, FolderPlus, Hash, LogOut } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatServerCliPath } from "@/lib/cli-path";
import type { useContextActionsMenu } from "@/lib/use-context-actions-menu";

type ServerActionsMenuProps = {
  contextMenu?: ReturnType<typeof useContextActionsMenu>;
  server: Server;
  contextOnly?: boolean;
  onOpenServerSettings: (server: Server) => void;
  canCreateChannels: boolean;
  onCreateChannel: (server: Server, kind: ServerChannelKind) => void;
  onLeaveServer: (server: Server) => void;
};

export function ServerActionsMenu({
  contextMenu,
  server,
  contextOnly = false,
  onOpenServerSettings,
  canCreateChannels,
  onCreateChannel,
  onLeaveServer,
}: ServerActionsMenuProps) {
  async function handleCopyServerId(serverId: string) {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      toast.error("Clipboard is not available.");
      return;
    }

    try {
      await navigator.clipboard.writeText(serverId);
      toast.success(`Copied server ID: ${serverId}`);
    } catch {
      toast.error("Failed to copy server ID.");
    }
  }

  async function handleCopyServerCliPath(host: string, serverId: string) {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      toast.error("Clipboard is not available.");
      return;
    }

    try {
      await navigator.clipboard.writeText(formatServerCliPath(host, serverId));
      toast.success("Copied CLI path.");
    } catch {
      toast.error("Failed to copy CLI path.");
    }
  }

  return (
    <DropdownMenu {...contextMenu?.menuProps}>
      {contextOnly ? null : (
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="flex size-8 cursor-pointer items-center justify-center rounded-xl text-sidebar-foreground/55 transition hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              aria-label="Open server menu"
            />
          }
        >
          <Ellipsis className="size-4" />
        </DropdownMenuTrigger>
      )}
      <DropdownMenuContent
        anchor={contextMenu?.anchor}
        align={contextMenu?.anchor ? "start" : "end"}
        side="bottom"
        sideOffset={contextMenu?.anchor ? 0 : 8}
        className="w-72"
      >
        <DropdownMenuItem
          className="cursor-pointer gap-3 rounded-xl px-3 py-2"
          onClick={() => {
            onOpenServerSettings(server);
          }}
        >
          <Cog className="size-4" />
          <span className="font-medium">Server settings</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer gap-3 rounded-xl px-3 py-2"
          disabled={!canCreateChannels}
          onClick={() => onCreateChannel(server, "text")}
        >
          <Hash className="size-4" />
          <span className="font-medium">Create channel</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer gap-3 rounded-xl px-3 py-2"
          disabled={!canCreateChannels}
          onClick={() => onCreateChannel(server, "category")}
        >
          <FolderPlus className="size-4" />
          <span className="font-medium">Create category</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer gap-3 rounded-xl px-3 py-2"
          onClick={() => {
            void handleCopyServerId(server.id);
          }}
        >
          <Copy className="size-4" />
          <span className="font-medium">Copy server ID</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer gap-3 rounded-xl px-3 py-2"
          onClick={() => {
            void handleCopyServerCliPath(server.host, server.id);
          }}
        >
          <Copy className="size-4" />
          <span className="font-medium">Copy path for CLI</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          className="cursor-pointer gap-3 rounded-xl px-3 py-2"
          onClick={() => {
            onLeaveServer(server);
          }}
        >
          <LogOut className="size-4" />
          <span className="font-medium">Leave server</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
