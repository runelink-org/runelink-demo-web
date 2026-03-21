import type { Channel, ServerWithChannels } from "@runelink/sdk";
import { Hash, Layers3, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ProfileSelector } from "@/components/ProfileSelector";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
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
  onCreateChannel: (title: string, description: string) => Promise<void>;
  onDeleteChannel: (channel: Channel) => Promise<void>;
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
  onCreateChannel,
  onDeleteChannel,
}: SidebarProps) {
  const [channelPanelWidth, setChannelPanelWidth] = useState<number>(() =>
    loadStoredChannelPanelWidth()
  );
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreatingChannel, setIsCreatingChannel] = useState(false);
  const [channelPendingDelete, setChannelPendingDelete] =
    useState<Channel | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeletingChannel, setIsDeletingChannel] = useState(false);

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

  async function handleCreateChannelSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const nextTitle = createTitle.trim();
    if (!nextTitle) {
      setCreateError("Channel name is required.");
      return;
    }

    setIsCreatingChannel(true);
    setCreateError(null);

    try {
      await onCreateChannel(nextTitle, createDescription);
      setCreateTitle("");
      setCreateDescription("");
      setIsCreateDialogOpen(false);
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : "Failed to create channel"
      );
    } finally {
      setIsCreatingChannel(false);
    }
  }

  async function handleDeleteChannelConfirm() {
    if (!channelPendingDelete) {
      return;
    }

    setIsDeletingChannel(true);
    setDeleteError(null);

    try {
      await onDeleteChannel(channelPendingDelete);
      setChannelPendingDelete(null);
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Failed to delete channel"
      );
    } finally {
      setIsDeletingChannel(false);
    }
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
                  setCreateError(null);
                  setCreateTitle("");
                  setCreateDescription("");
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
                          isSelected
                            ? "opacity-100"
                            : "opacity-0 group-hover:opacity-100",
                          "hover:bg-background/70 hover:text-destructive"
                        )}
                        onClick={() => {
                          setDeleteError(null);
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

      <AlertDialog
        open={isCreateDialogOpen}
        onOpenChange={(open) => {
          setIsCreateDialogOpen(open);
          if (!open) {
            setCreateError(null);
          }
        }}
      >
        <AlertDialogContent>
          <form className="space-y-4" onSubmit={handleCreateChannelSubmit}>
            <AlertDialogHeader>
              <AlertDialogTitle>Create channel</AlertDialogTitle>
              <AlertDialogDescription>
                Add a text channel to{" "}
                {selectedServer?.server.title ?? "this server"}.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-2">
              <Label htmlFor="channel-title">Name</Label>
              <Input
                id="channel-title"
                value={createTitle}
                onChange={(event) => setCreateTitle(event.target.value)}
                placeholder="general"
                disabled={isCreatingChannel}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="channel-description">Description</Label>
              <Textarea
                id="channel-description"
                value={createDescription}
                onChange={(event) => setCreateDescription(event.target.value)}
                placeholder="What is this channel for?"
                className="min-h-24 resize-none"
                disabled={isCreatingChannel}
              />
            </div>

            {createError ? (
              <p className="text-sm text-destructive">{createError}</p>
            ) : null}

            <AlertDialogFooter>
              <AlertDialogCancel disabled={isCreatingChannel}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction type="submit" disabled={isCreatingChannel}>
                {isCreatingChannel ? "Creating..." : "Create channel"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={channelPendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !isDeletingChannel) {
            setChannelPendingDelete(null);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete channel?</AlertDialogTitle>
            <AlertDialogDescription>
              {channelPendingDelete
                ? `This will remove #${channelPendingDelete.title} from the server.`
                : "This will remove the selected channel from the server."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {deleteError ? (
            <p className="text-sm text-destructive">{deleteError}</p>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingChannel}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              variant="destructive"
              disabled={isDeletingChannel}
              onClick={() => {
                void handleDeleteChannelConfirm();
              }}
            >
              {isDeletingChannel ? "Deleting..." : "Delete channel"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}
