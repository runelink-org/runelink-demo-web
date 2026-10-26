import type { Server, ServerChannelKind } from "@runelink/sdk";
import { Cog, Copy, Ellipsis, FolderPlus, Hash, LogOut } from "lucide-react";
import { CopyOtherSubmenu } from "@/components/CopyOtherSubmenu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { copyToClipboard } from "@/lib/clipboard";
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
  return (
    <DropdownMenu {...contextMenu?.menuProps}>
      {contextOnly ? null : (
        <DropdownMenuTrigger
          {...contextMenu?.targetProps}
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
            void copyToClipboard(server.id, `Copied server ID: ${server.id}`);
          }}
        >
          <Copy className="size-4" />
          <span className="font-medium">Copy server ID</span>
        </DropdownMenuItem>
        <CopyOtherSubmenu
          options={[
            {
              label: "Path for CLI",
              value: formatServerCliPath(server.host, server.id),
              successLabel: "Copied CLI path.",
            },
          ]}
        />
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
