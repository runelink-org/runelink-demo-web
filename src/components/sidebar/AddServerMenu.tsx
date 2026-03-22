import type { Server } from "@runelink/sdk";
import { Plus, Search } from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreateServerDialog } from "./CreateServerDialog";
import { JoinServerDialog } from "./JoinServerDialog";

type AddServerMenuProps = {
  activeHost: string | null;
  joinedServerIds: Set<string>;
  onCreateServer: (
    host: string,
    title: string,
    description: string
  ) => Promise<void>;
  onSearchServers: (host: string) => Promise<Server[]>;
  onJoinServer: (serverId: string, serverHost: string) => Promise<void>;
};

export function AddServerMenu({
  activeHost,
  joinedServerIds,
  onCreateServer,
  onSearchServers,
  onJoinServer,
}: AddServerMenuProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isJoinDialogOpen, setIsJoinDialogOpen] = useState(false);

  return (
    <>
      <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <DropdownMenuTrigger render={<button type="button" />}>
          <span
            className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-dashed border-sidebar-border bg-sidebar-accent/45 text-sidebar-foreground/70 transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            aria-label="Add server"
            title="Add server"
          >
            <Plus className="size-5" />
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="right"
          align="end"
          sideOffset={10}
          className="w-56 rounded-2xl p-2"
        >
          <DropdownMenuItem
            className="cursor-pointer gap-3 rounded-xl px-3 py-2"
            onClick={() => {
              setIsMenuOpen(false);
              setIsCreateDialogOpen(true);
            }}
          >
            <Plus className="size-4" />
            <div className="flex flex-col">
              <span className="font-medium">Create server</span>
              <span className="text-xs text-muted-foreground">
                Start a new space on your host.
              </span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer gap-3 rounded-xl px-3 py-2"
            onClick={() => {
              setIsMenuOpen(false);
              setIsJoinDialogOpen(true);
            }}
          >
            <Search className="size-4" />
            <div className="flex flex-col">
              <span className="font-medium">Join server</span>
              <span className="text-xs text-muted-foreground">
                Look up servers by host name.
              </span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateServerDialog
        activeHost={activeHost}
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onCreateServer={onCreateServer}
      />

      <JoinServerDialog
        open={isJoinDialogOpen}
        activeHost={activeHost}
        joinedServerIds={joinedServerIds}
        onOpenChange={setIsJoinDialogOpen}
        onSearchServers={onSearchServers}
        onJoinServer={onJoinServer}
      />
    </>
  );
}
