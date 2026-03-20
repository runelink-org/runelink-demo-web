import type { Channel, ServerWithChannels } from "@runelink/sdk";
import { Hash, Layers3, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { ProfileSelector } from "@/components/ProfileSelector";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type SidebarProps = {
  servers: ServerWithChannels[];
  selectedServerId: string | null;
  selectedChannelId: string | null;
  isLoading: boolean;
  error: string | null;
  onManageAccounts: () => void;
  onSelectAccount: () => void;
  onSelectServer: (serverId: string) => void;
  onSelectChannel: (serverId: string, channel: Channel) => void;
};

const CHANNEL_PANEL_WIDTH_KEY = "runelink.demo.channels-sidebar-width";
const DEFAULT_CHANNEL_PANEL_WIDTH = 320;
const MIN_CHANNEL_PANEL_WIDTH = 120;
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

function getServerMonogram(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

export function Sidebar({
  servers,
  selectedServerId,
  selectedChannelId,
  isLoading,
  error,
  onManageAccounts,
  onSelectAccount,
  onSelectServer,
  onSelectChannel,
}: SidebarProps) {
  const [channelPanelWidth, setChannelPanelWidth] = useState<number>(() =>
    loadStoredChannelPanelWidth()
  );

  const selectedServer = selectedServerId
    ? (servers.find((server) => server.server.id === selectedServerId) ?? null)
    : null;

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
    <aside className="flex h-screen shrink-0 border-r border-sidebar-border bg-sidebar/95 backdrop-blur">
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
          <h2 className="mt-2 truncate text-lg font-semibold text-sidebar-foreground">
            {selectedServer?.server.title ?? "Choose a server"}
          </h2>
          <p className="mt-1 line-clamp-2 text-sm text-sidebar-foreground/70">
            {selectedServer?.server.description ??
              (error
                ? "RuneLink could not load your available servers."
                : "Select a server on the left to browse its channels.")}
          </p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-3 py-3">
          <div className="mb-2 px-2">
            <p className="text-xs font-semibold tracking-[0.2em] text-sidebar-foreground/55 uppercase">
              Channels
            </p>
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
                    <Button
                      key={channel.id}
                      variant="ghost"
                      className={cn(
                        "h-auto w-full justify-start rounded-2xl px-3 py-3 text-left",
                        isSelected
                          ? "bg-primary/12 text-foreground hover:bg-primary/15"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
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
    </aside>
  );
}
