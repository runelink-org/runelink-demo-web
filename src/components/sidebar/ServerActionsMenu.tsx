import type { Server } from "@runelink/sdk";
import { Copy, Ellipsis, LogOut, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatServerCliPath } from "@/lib/cli-path";
import { formatServerTimestamp } from "./server-display";

type ServerActionsMenuProps = {
  server: Server;
  canDeleteServer: boolean;
  onDeleteServer: (server: Server) => void;
  onLeaveServer: (server: Server) => void;
};

export function ServerActionsMenu({
  server,
  canDeleteServer,
  onDeleteServer,
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
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-xl text-sidebar-foreground/55 transition hover:bg-background/70 hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            aria-label="Open server menu"
          />
        }
      >
        <Ellipsis className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="bottom"
        sideOffset={8}
        className="w-72"
      >
        <div className="px-3 py-2 text-left">
          <p className="truncate text-sm font-semibold text-sidebar-foreground">
            <span>{server.title}</span>
            <span className="text-sidebar-foreground/50">@{server.host}</span>
          </p>
          <div className="mt-2 space-y-1 text-xs text-sidebar-foreground/65">
            <p>
              Created:{" "}
              <span className="text-sidebar-foreground/90">
                {formatServerTimestamp(server.created_at)}
              </span>
            </p>
          </div>
        </div>
        <DropdownMenuSeparator />
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
          disabled={!canDeleteServer}
          className="cursor-pointer gap-3 rounded-xl px-3 py-2"
          onClick={() => {
            if (!canDeleteServer) {
              return;
            }

            onDeleteServer(server);
          }}
        >
          <Trash2 className="size-4" />
          <span className="font-medium">Delete server</span>
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
