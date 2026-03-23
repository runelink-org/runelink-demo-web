import type { Channel, Server, ServerWithChannels } from "@runelink/sdk";
import { Layers3, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ProfileSelector } from "@/components/ProfileSelector";
import { AddServerMenu } from "@/components/sidebar/AddServerMenu";
import { CreateChannelDialog } from "@/components/sidebar/CreateChannelDialog";
import { ChannelSection } from "@/components/sidebar/ChannelSection";
import { DeleteChannelDialog } from "@/components/sidebar/DeleteChannelDialog";
import { DeleteServerDialog } from "@/components/sidebar/DeleteServerDialog";
import { LeaveServerDialog } from "@/components/sidebar/LeaveServerDialog";
import { ServerActionsMenu } from "@/components/sidebar/ServerActionsMenu";
import { ServerRailButton } from "@/components/sidebar/ServerRailButton";
import { Separator } from "@/components/ui/separator";

type SidebarProps = {
  servers: ServerWithChannels[];
  selectedServerId: string | null;
  selectedChannelId: string | null;
  selectedChannelIdByServerId: Record<string, string | null>;
  isLoading: boolean;
  error: string | null;
  isSelectedServerHydrating: boolean;
  activeHost: string | null;
  onManageAccounts: () => void;
  onSelectAccount: () => void;
  onSelectServer: (serverId: string) => void;
  onSelectChannel: (serverId: string, channel: Channel) => void;
  onCreateServer: (
    host: string,
    title: string,
    description: string
  ) => Promise<void>;
  onSearchServers: (host: string) => Promise<Server[]>;
  onJoinServer: (serverId: string, serverHost: string) => Promise<void>;
  onLeaveServer: (serverId: string, serverHost: string) => Promise<void>;
  onDeleteServer: (serverId: string, serverHost: string) => Promise<void>;
  canDeleteSelectedServer: boolean;
  onCreateChannel: (title: string, description: string) => Promise<void>;
  onDeleteChannel: (channel: Channel) => Promise<void>;
};

const CHANNEL_PANEL_WIDTH_KEY = "runelink.demo.channels-sidebar-width";
const DEFAULT_CHANNEL_PANEL_WIDTH = 320;
const MIN_CHANNEL_PANEL_WIDTH = 160;
const MAX_CHANNEL_PANEL_WIDTH = 420;

type PendingSelection = {
  serverId: string;
  channelId: string | null;
};

function clampChannelPanelWidth(value: number): number {
  return Math.min(
    MAX_CHANNEL_PANEL_WIDTH,
    Math.max(MIN_CHANNEL_PANEL_WIDTH, value)
  );
}

function loadStoredChannelPanelWidth(): number {
  if (typeof window === "undefined") {
    return DEFAULT_CHANNEL_PANEL_WIDTH;
  }

  const storedWidth = window.localStorage.getItem(CHANNEL_PANEL_WIDTH_KEY);
  if (!storedWidth) {
    return DEFAULT_CHANNEL_PANEL_WIDTH;
  }

  const parsedWidth = Number(storedWidth);
  return Number.isFinite(parsedWidth)
    ? clampChannelPanelWidth(parsedWidth)
    : DEFAULT_CHANNEL_PANEL_WIDTH;
}

export function Sidebar({
  servers,
  selectedServerId,
  selectedChannelId,
  selectedChannelIdByServerId,
  isLoading,
  error,
  isSelectedServerHydrating,
  activeHost,
  onManageAccounts,
  onSelectAccount,
  onSelectServer,
  onSelectChannel,
  onCreateServer,
  onSearchServers,
  onJoinServer,
  onLeaveServer,
  onDeleteServer,
  canDeleteSelectedServer,
  onCreateChannel,
  onDeleteChannel,
}: SidebarProps) {
  const [channelPanelWidth, setChannelPanelWidth] = useState<number>(() =>
    loadStoredChannelPanelWidth()
  );
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [channelPendingDelete, setChannelPendingDelete] =
    useState<Channel | null>(null);
  const [serverPendingLeave, setServerPendingLeave] = useState<Server | null>(
    null
  );
  const [serverPendingDelete, setServerPendingDelete] = useState<Server | null>(
    null
  );
  const [pendingSelection, setPendingSelection] =
    useState<PendingSelection | null>(null);
  const previousSelectionRef = useRef({
    serverId: selectedServerId,
    channelId: selectedChannelId,
  });
  const pendingNavigationTimeoutRef = useRef<number | null>(null);

  const effectiveSelectedServerId =
    pendingSelection?.serverId ?? selectedServerId;
  const effectiveSelectedChannelId =
    pendingSelection?.channelId ?? selectedChannelId;
  const selectedServer = effectiveSelectedServerId
    ? (servers.find(
        (server) => server.server.id === effectiveSelectedServerId
      ) ?? null)
    : null;
  const joinedServerIds = new Set(servers.map((server) => server.server.id));

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      CHANNEL_PANEL_WIDTH_KEY,
      String(channelPanelWidth)
    );
  }, [channelPanelWidth]);

  useEffect(() => {
    return () => {
      if (pendingNavigationTimeoutRef.current !== null) {
        window.clearTimeout(pendingNavigationTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!pendingSelection) {
      previousSelectionRef.current = {
        serverId: selectedServerId,
        channelId: selectedChannelId,
      };
      return;
    }

    const selectionChangedExternally =
      previousSelectionRef.current.serverId !== selectedServerId ||
      previousSelectionRef.current.channelId !== selectedChannelId;
    const pendingSelectionCommitted =
      selectedServerId === pendingSelection.serverId &&
      (pendingSelection.channelId === null ||
        selectedChannelId === pendingSelection.channelId);

    if (pendingSelectionCommitted || selectionChangedExternally) {
      const timeoutId = window.setTimeout(() => {
        setPendingSelection(null);
      }, 0);

      previousSelectionRef.current = {
        serverId: selectedServerId,
        channelId: selectedChannelId,
      };

      return () => {
        window.clearTimeout(timeoutId);
      };
    }

    previousSelectionRef.current = {
      serverId: selectedServerId,
      channelId: selectedChannelId,
    };
  }, [pendingSelection, selectedChannelId, selectedServerId]);

  function handleResizeStart(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = channelPanelWidth;

    function handlePointerMove(pointerEvent: PointerEvent) {
      setChannelPanelWidth(
        clampChannelPanelWidth(startWidth + pointerEvent.clientX - startX)
      );
    }

    function handlePointerUp() {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  function scheduleSelectionCommit(
    nextSelection: PendingSelection,
    commitSelection: () => void
  ) {
    if (pendingNavigationTimeoutRef.current !== null) {
      window.clearTimeout(pendingNavigationTimeoutRef.current);
    }

    flushSync(() => {
      setPendingSelection(nextSelection);
    });

    pendingNavigationTimeoutRef.current = window.setTimeout(() => {
      pendingNavigationTimeoutRef.current = null;
      commitSelection();
    }, 0);
  }

  return (
    <aside className="relative z-20 flex h-screen shrink-0 border-r border-sidebar-border bg-sidebar/95 backdrop-blur">
      <div className="flex w-20 flex-col items-center gap-4 border-r border-sidebar-border/80 px-3 py-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <img
            src="/runelink_logo.jpg"
            alt="RuneLink"
            className="size-12 rounded-2xl object-cover shadow-sm"
          />
          <p className="text-[11px] font-semibold tracking-[0.18em] text-sidebar-foreground/70 uppercase">
            Rune
          </p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center gap-3 overflow-y-auto pb-1">
          {isLoading ? (
            <div className="flex size-12 items-center justify-center rounded-2xl border border-sidebar-border bg-sidebar-accent text-sidebar-foreground/70">
              <LoaderCircle className="size-4 animate-spin" />
            </div>
          ) : servers.length === 0 ? (
            <div className="flex size-12 items-center justify-center rounded-2xl border border-dashed border-sidebar-border bg-sidebar-accent/60 text-sidebar-foreground/50">
              <Layers3 className="size-4" />
            </div>
          ) : (
            servers.map(({ server }) => {
              const isSelected = server.id === effectiveSelectedServerId;

              return (
                <ServerRailButton
                  key={server.id}
                  isSelected={isSelected}
                  server={server}
                  onSelect={(nextServerId) => {
                    const nextChannelId =
                      selectedChannelIdByServerId[nextServerId] ?? null;

                    scheduleSelectionCommit(
                      {
                        serverId: nextServerId,
                        channelId: nextChannelId,
                      },
                      () => {
                        onSelectServer(nextServerId);
                      }
                    );
                  }}
                />
              );
            })
          )}

          <AddServerMenu
            activeHost={activeHost}
            joinedServerIds={joinedServerIds}
            onCreateServer={onCreateServer}
            onSearchServers={onSearchServers}
            onJoinServer={onJoinServer}
          />
        </div>

        <ProfileSelector
          onManageAccounts={onManageAccounts}
          onSelectAccount={onSelectAccount}
        />
      </div>

      <div
        className="flex min-w-0 flex-col bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-sidebar)_96%,white),color-mix(in_oklab,var(--color-sidebar-accent)_85%,white))]"
        style={{ width: `${channelPanelWidth}px` }}
      >
        <div className="border-b border-sidebar-border/80 px-4 py-4">
          <p className="text-xs font-semibold tracking-[0.2em] text-sidebar-foreground/55 uppercase">
            Server
          </p>
          <div className="mt-2 flex min-w-0 items-center justify-between gap-2">
            <h2 className="min-w-0 flex-1 truncate text-lg font-semibold text-sidebar-foreground">
              {selectedServer?.server.title ?? "Choose a server"}
            </h2>
            {selectedServer ? (
              <ServerActionsMenu
                server={selectedServer.server}
                canDeleteServer={canDeleteSelectedServer}
                onDeleteServer={(server) => {
                  setServerPendingDelete(server);
                }}
                onLeaveServer={(server) => {
                  setServerPendingLeave(server);
                }}
              />
            ) : null}
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-sidebar-foreground/70">
            {selectedServer
              ? (selectedServer.server.description ?? "")
              : error
                ? "RuneLink could not load your available servers."
                : "Select a server on the left to browse its channels."}
          </p>
        </div>

        <ChannelSection
          selectedServer={selectedServer}
          selectedChannelId={effectiveSelectedChannelId}
          isLoading={isLoading}
          error={error}
          isSelectedServerHydrating={isSelectedServerHydrating}
          canCreateChannel={canDeleteSelectedServer}
          canDeleteSelectedServer={canDeleteSelectedServer}
          onOpenCreateChannel={() => {
            setIsCreateDialogOpen(true);
          }}
          onSelectChannel={(serverId, channel) => {
            scheduleSelectionCommit(
              {
                serverId,
                channelId: channel.id,
              },
              () => {
                onSelectChannel(serverId, channel);
              }
            );
          }}
          onDeleteChannel={(channel) => {
            setChannelPendingDelete(channel);
          }}
        />
      </div>

      <button
        type="button"
        className="group relative hidden w-3 shrink-0 cursor-col-resize items-stretch justify-center bg-sidebar/40 transition hover:bg-sidebar-accent/60 md:flex"
        aria-label="Resize channels sidebar"
        onPointerDown={handleResizeStart}
      >
        <Separator
          orientation="vertical"
          className="bg-sidebar-border transition group-hover:bg-primary"
        />
      </button>

      <CreateChannelDialog
        open={isCreateDialogOpen}
        serverTitle={selectedServer?.server.title ?? null}
        onOpenChange={setIsCreateDialogOpen}
        onCreateChannel={onCreateChannel}
      />

      <DeleteChannelDialog
        channel={channelPendingDelete}
        onOpenChange={(open) => {
          if (!open) {
            setChannelPendingDelete(null);
          }
        }}
        onDeleteChannel={onDeleteChannel}
      />

      <LeaveServerDialog
        server={serverPendingLeave}
        onOpenChange={(open) => {
          if (!open) {
            setServerPendingLeave(null);
          }
        }}
        onLeaveServer={onLeaveServer}
      />

      <DeleteServerDialog
        server={serverPendingDelete}
        onOpenChange={(open) => {
          if (!open) {
            setServerPendingDelete(null);
          }
        }}
        onDeleteServer={onDeleteServer}
      />
    </aside>
  );
}
