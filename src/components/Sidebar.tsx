import type { Channel, Server, ServerWithChannels } from "@runelink/sdk";
import { Hash, Info, Layers3, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ProfileSelector } from "@/components/ProfileSelector";
import { AddServerMenu } from "@/components/sidebar/AddServerMenu";
import { CreateChannelDialog } from "@/components/sidebar/CreateChannelDialog";
import { DeleteChannelDialog } from "@/components/sidebar/DeleteChannelDialog";
import {
  formatServerTimestamp,
  getServerMonogram,
} from "@/components/sidebar/server-display";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type SidebarProps = {
  servers: ServerWithChannels[];
  selectedServerId: string | null;
  selectedChannelId: string | null;
  isLoading: boolean;
  error: string | null;
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
  onCreateChannel: (title: string, description: string) => Promise<void>;
  onDeleteChannel: (channel: Channel) => Promise<void>;
};

const CHANNEL_PANEL_WIDTH_KEY = "runelink.demo.channels-sidebar-width";
const DEFAULT_CHANNEL_PANEL_WIDTH = 320;
const MIN_CHANNEL_PANEL_WIDTH = 160;
const MAX_CHANNEL_PANEL_WIDTH = 420;

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
  isLoading,
  error,
  activeHost,
  onManageAccounts,
  onSelectAccount,
  onSelectServer,
  onSelectChannel,
  onCreateServer,
  onSearchServers,
  onJoinServer,
  onCreateChannel,
  onDeleteChannel,
}: SidebarProps) {
  const [channelPanelWidth, setChannelPanelWidth] = useState<number>(() =>
    loadStoredChannelPanelWidth()
  );
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [channelPendingDelete, setChannelPendingDelete] =
    useState<Channel | null>(null);

  const selectedServer = selectedServerId
    ? (servers.find((server) => server.server.id === selectedServerId) ?? null)
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
              const isSelected = server.id === selectedServerId;

              return (
                <button
                  key={server.id}
                  type="button"
                  className={cn(
                    "group relative flex size-12 shrink-0 items-center justify-center rounded-2xl border text-sm font-semibold transition",
                    isSelected
                      ? "border-primary/30 bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                      : "border-sidebar-border bg-sidebar-accent text-sidebar-foreground hover:-translate-y-0.5 hover:bg-sidebar-accent/80"
                  )}
                  onClick={() => onSelectServer(server.id)}
                  title={server.title}
                  aria-pressed={isSelected}
                >
                  <span
                    className="pointer-events-none absolute -left-2 h-6 w-1 rounded-full bg-primary opacity-0 transition group-hover:opacity-60 data-[selected=true]:opacity-100"
                    data-selected={isSelected}
                  />
                  {getServerMonogram(server.title)}
                </button>
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
          <div className="mt-2 flex min-w-0 items-center gap-2">
            <h2 className="min-w-0 truncate text-lg font-semibold text-sidebar-foreground">
              {selectedServer?.server.title ?? "Choose a server"}
            </h2>
            {selectedServer ? (
              <div className="group/server-info relative shrink-0">
                <button
                  type="button"
                  className="flex size-5 items-center justify-center text-sidebar-foreground/45 transition hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  aria-label="Show server details"
                >
                  <Info className="size-3.5" />
                </button>
                <div className="pointer-events-none absolute top-8 left-0 z-50 w-64 rounded-2xl border border-sidebar-border/80 bg-sidebar p-3 text-left opacity-0 shadow-lg shadow-black/8 transition duration-150 group-hover/server-info:pointer-events-auto group-hover/server-info:opacity-100 group-focus-within/server-info:pointer-events-auto group-focus-within/server-info:opacity-100">
                  <p className="truncate text-sm font-semibold text-sidebar-foreground">
                    {selectedServer.server.title}
                  </p>
                  <div className="mt-2 space-y-1.5 text-xs text-sidebar-foreground/65">
                    <p>
                      Host:{" "}
                      <span className="text-sidebar-foreground/90">
                        @{selectedServer.server.host}
                      </span>
                    </p>
                    <p>
                      Created:{" "}
                      <span className="text-sidebar-foreground/90">
                        {formatServerTimestamp(
                          selectedServer.server.created_at
                        )}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-sidebar-foreground/70">
            {selectedServer?.server.description ??
              (error
                ? "RuneLink could not load your available servers."
                : "Select a server on the left to browse its channels.")}
          </p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-3 py-3">
          <div className="mb-2 px-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold tracking-[0.2em] text-sidebar-foreground/55 uppercase">
                Channels
              </p>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-7 rounded-xl text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                onClick={() => {
                  setIsCreateDialogOpen(true);
                }}
                disabled={!selectedServer}
                aria-label="Create channel"
              >
                <Plus className="size-4" />
              </Button>
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
            ) : selectedServer.channels.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-sidebar-border bg-sidebar-accent/50 px-4 py-3 text-sm text-sidebar-foreground/70">
                This server does not have any channels yet.
              </div>
            ) : (
              <div className="space-y-1">
                {selectedServer.channels.map((channel) => {
                  const isSelected = channel.id === selectedChannelId;

                  return (
                    <div
                      key={channel.id}
                      className={cn(
                        "group flex items-center gap-2 rounded-2xl pr-2 transition",
                        isSelected ? "bg-primary/12" : "hover:bg-sidebar-accent"
                      )}
                    >
                      <Button
                        variant="ghost"
                        className={cn(
                          "h-auto min-w-0 flex-1 justify-start rounded-2xl px-3 py-3 text-left",
                          isSelected
                            ? "text-foreground hover:bg-transparent"
                            : "text-sidebar-foreground/80 hover:bg-transparent hover:text-sidebar-foreground"
                        )}
                        onClick={() =>
                          onSelectChannel(selectedServer.server.id, channel)
                        }
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <Hash className="mt-0.5 size-4 shrink-0 text-sidebar-foreground/50" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {channel.title}
                            </p>
                            {channel.description ? (
                              <p className="mt-0.5 truncate text-xs text-sidebar-foreground/55">
                                {channel.description}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </Button>

                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className={cn(
                          "size-8 shrink-0 rounded-xl text-sidebar-foreground/55 transition",
                          "opacity-0 group-hover:opacity-100",
                          "hover:bg-background/70 hover:text-destructive"
                        )}
                        onClick={() => {
                          setChannelPendingDelete(channel);
                        }}
                        aria-label={`Delete ${channel.title}`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
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
    </aside>
  );
}
