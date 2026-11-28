import { serverRefOf, resourceKey } from "@runelink/sdk";
import type {
  Host,
  ResourceKey,
  Server,
  ServerChannel,
  ServerChannelId,
  ServerChannelKind,
  ServerChannelMove,
  ServerId,
  ServerRef,
  ServerWithChannels,
} from "@runelink/sdk";
import { Layers3, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ProfileSelector } from "@/components/ProfileSelector";
import { AddServerMenu } from "@/components/sidebar/AddServerMenu";
import { CreateChannelDialog } from "@/components/sidebar/CreateChannelDialog";
import type { CreateChannelRequest } from "@/components/sidebar/CreateChannelDialog";
import { ChannelSection } from "@/components/sidebar/ChannelSection";
import { DeleteChannelDialog } from "@/components/sidebar/DeleteChannelDialog";
import { DeleteServerDialog } from "@/components/sidebar/DeleteServerDialog";
import { LeaveServerDialog } from "@/components/sidebar/LeaveServerDialog";
import { ServerRailSettingsMenu } from "@/components/sidebar/ServerRailSettingsMenu";
import { ServerActionsMenu } from "@/components/sidebar/ServerActionsMenu";
import { ServerRailButton } from "@/components/sidebar/ServerRailButton";
import { Separator } from "@/components/ui/separator";
import { useContextActionsMenu } from "@/lib/use-context-actions-menu";
import { getAppRoutePath, getContentRoute } from "@/lib/app-route";
import { sameResource } from "@/lib/runelink-store-utils";
import type { RequestEffect } from "@/lib/runelink-session";
import * as Effect from "effect/Effect";

type SidebarProps = {
  servers: readonly ServerWithChannels[];
  selectedServerKey: ResourceKey<ServerId> | null;
  selectedChannelId: ServerChannelId | null;
  selectedChannelIdByServerKey: Record<
    ResourceKey<ServerId>,
    ServerChannelId | null
  >;
  isLoading: boolean;
  error: string | null;
  isSelectedServerHydrating: boolean;
  activeHost: Host | null;
  accountRailOnly?: boolean;
  onManageAccounts: () => void;
  onSelectAccount: () => void;
  onSelectServer: (serverRef: ServerRef) => void;
  onSelectChannel: (channel: ServerChannel) => void;
  onCreateServer: (
    host: Host,
    title: string,
    description: string
  ) => RequestEffect<void>;
  onSearchServers: (host: Host) => RequestEffect<readonly Server[]>;
  onJoinServer: (serverRef: ServerRef) => RequestEffect<void>;
  onOpenServerSettings: (server: Server) => void;
  onLeaveServer: (serverRef: ServerRef) => RequestEffect<void>;
  onDeleteServer: (serverRef: ServerRef) => RequestEffect<void>;
  canDeleteSelectedServer: boolean;
  canManageServer: (server: Server) => boolean;
  onCreateChannel: (
    server: Server,
    kind: ServerChannelKind,
    title: string,
    parentChannelId: ServerChannelId | null
  ) => RequestEffect<void>;
  onDeleteChannel: (channel: ServerChannel) => RequestEffect<void>;
  onEditChannel: (channel: ServerChannel) => void;
  onMoveChannel: (
    channel: ServerChannel,
    channelMove: ServerChannelMove
  ) => RequestEffect<void>;
};

const NO_COLLAPSED_IDS: ReadonlySet<ServerChannelId> = new Set();

const CHANNEL_PANEL_WIDTH_KEY = "runelink.demo.channels-sidebar-width";
const DEFAULT_CHANNEL_PANEL_WIDTH = 280;
const MIN_CHANNEL_PANEL_WIDTH = 160;
const MAX_CHANNEL_PANEL_WIDTH = 420;

type PendingSelection = {
  serverKey: ResourceKey<ServerId>;
  channelId: ServerChannelId | null;
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
  if (storedWidth == null || storedWidth === "") {
    return DEFAULT_CHANNEL_PANEL_WIDTH;
  }

  const parsedWidth = Number(storedWidth);
  return Number.isFinite(parsedWidth)
    ? clampChannelPanelWidth(parsedWidth)
    : DEFAULT_CHANNEL_PANEL_WIDTH;
}

export function Sidebar({
  servers,
  selectedServerKey,
  selectedChannelId,
  selectedChannelIdByServerKey,
  isLoading,
  error,
  isSelectedServerHydrating,
  activeHost,
  accountRailOnly = false,
  onManageAccounts,
  onSelectAccount,
  onSelectServer,
  onSelectChannel,
  onCreateServer,
  onSearchServers,
  onJoinServer,
  onOpenServerSettings,
  onLeaveServer,
  onDeleteServer,
  canDeleteSelectedServer,
  canManageServer,
  onCreateChannel,
  onDeleteChannel,
  onEditChannel,
  onMoveChannel,
}: SidebarProps) {
  const serverMenu = useContextActionsMenu();
  const addServerMenu = useContextActionsMenu();
  const [channelPanelWidth, setChannelPanelWidth] = useState<number>(() =>
    loadStoredChannelPanelWidth()
  );
  const [createChannelRequest, setCreateChannelRequest] = useState<
    (CreateChannelRequest & { server: Server }) | null
  >(null);
  const [channelPendingDelete, setChannelPendingDelete] =
    useState<ServerChannel | null>(null);
  const [serverPendingLeave, setServerPendingLeave] = useState<Server | null>(
    null
  );
  const [serverPendingDelete, setServerPendingDelete] = useState<Server | null>(
    null
  );
  const [collapsedIdsByServerKey, setCollapsedIdsByServerKey] = useState<
    Record<ResourceKey<ServerId>, ReadonlySet<ServerChannelId>>
  >({});
  const [pendingSelection, setPendingSelection] =
    useState<PendingSelection | null>(null);
  const previousSelectionRef = useRef({
    serverKey: selectedServerKey,
    channelId: selectedChannelId,
  });
  const pendingNavigationTimeoutRef = useRef<number | null>(null);

  const effectiveSelectedServerKey =
    pendingSelection?.serverKey ?? selectedServerKey;
  // A pending selection of no channel is kept, rather than showing the
  // previous server's channel
  const effectiveSelectedChannelId = pendingSelection
    ? pendingSelection.channelId
    : selectedChannelId;
  const selectedServer =
    servers.find(
      ({ server }) => resourceKey(server) === effectiveSelectedServerKey
    ) ?? null;
  // The server whose channels are shown, which may be a pending selection
  const shownServerKey = selectedServer
    ? resourceKey(selectedServer.server)
    : null;
  const createChannelServer = createChannelRequest
    ? servers.find(({ server }) =>
        sameResource(server, createChannelRequest.server)
      )
    : undefined;
  const joinedServerKeys = new Set(
    servers.map(({ server }) => resourceKey(server))
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      CHANNEL_PANEL_WIDTH_KEY,
      String(channelPanelWidth)
    );
  }, [channelPanelWidth]);

  useEffect(
    () => () => {
      if (pendingNavigationTimeoutRef.current !== null) {
        window.clearTimeout(pendingNavigationTimeoutRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!pendingSelection) {
      previousSelectionRef.current = {
        serverKey: selectedServerKey,
        channelId: selectedChannelId,
      };
      return undefined;
    }

    const selectionChangedExternally =
      previousSelectionRef.current.serverKey !== selectedServerKey ||
      previousSelectionRef.current.channelId !== selectedChannelId;
    const pendingSelectionCommitted =
      selectedServerKey === pendingSelection.serverKey &&
      (pendingSelection.channelId === null ||
        selectedChannelId === pendingSelection.channelId);

    if (pendingSelectionCommitted || selectionChangedExternally) {
      const timeoutId = window.setTimeout(() => {
        setPendingSelection(null);
      }, 0);

      previousSelectionRef.current = {
        serverKey: selectedServerKey,
        channelId: selectedChannelId,
      };

      return () => {
        window.clearTimeout(timeoutId);
      };
    }

    previousSelectionRef.current = {
      serverKey: selectedServerKey,
      channelId: selectedChannelId,
    };
    return undefined;
  }, [pendingSelection, selectedChannelId, selectedServerKey]);

  function openCreateChannel(
    server: Server,
    kind: ServerChannelKind,
    parentChannelId: ServerChannelId | null = null
  ) {
    setCreateChannelRequest({ server, kind, parentChannelId });
  }

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

  const serverSelectionHint =
    error != null && error !== ""
      ? "RuneLink could not load your available servers."
      : "Select a server on the left to browse its channels.";

  function renderServerRail() {
    if (accountRailOnly) return null;
    if (isLoading) {
      return (
        <div className="flex size-12 items-center justify-center rounded-2xl border border-sidebar-border bg-sidebar-accent text-sidebar-foreground/70">
          <LoaderCircle className="size-4 animate-spin" />
        </div>
      );
    }
    if (servers.length === 0) {
      return (
        <div className="flex size-12 items-center justify-center rounded-2xl border border-dashed border-sidebar-border bg-sidebar-accent/60 text-sidebar-foreground/50">
          <Layers3 className="size-4" />
        </div>
      );
    }
    return servers.map(({ server }) => {
      const serverKey = resourceKey(server);
      const isSelected = serverKey === effectiveSelectedServerKey;

      return (
        <ServerRailButton
          key={serverKey}
          isSelected={isSelected}
          server={server}
          href={getAppRoutePath(
            getContentRoute(
              server,
              selectedChannelIdByServerKey[serverKey] ?? null
            )
          )}
          onOpenServerSettings={onOpenServerSettings}
          canCreateChannels={canManageServer(server)}
          onCreateChannel={openCreateChannel}
          onLeaveServer={setServerPendingLeave}
          onSelect={() => {
            scheduleSelectionCommit(
              {
                serverKey,
                channelId: selectedChannelIdByServerKey[serverKey] ?? null,
              },
              () => {
                onSelectServer(server);
              }
            );
          }}
        />
      );
    });
  }

  return (
    <aside
      className={[
        "relative z-20 flex h-dvh shrink-0 border-r border-sidebar-border bg-sidebar/95 backdrop-blur",
        accountRailOnly ? "w-20" : "w-full sm:w-auto",
      ].join(" ")}
    >
      <div
        {...(accountRailOnly ? {} : addServerMenu.targetProps)}
        className="flex w-20 flex-col items-center gap-4 border-r border-sidebar-border/80 py-4"
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <img
            src="/logos/runelink_logo_black.svg"
            alt="RuneLink"
            className="size-12 drop-shadow-sm dark:hidden"
          />
          <img
            src="/logos/runelink_logo_white.svg"
            alt="RuneLink"
            className="hidden size-12 drop-shadow-sm dark:block"
          />
        </div>

        <div
          className="flex min-h-0 w-full flex-1 flex-col items-center gap-3 overflow-y-auto px-3 pb-1"
          data-sidebar-scroll
        >
          {renderServerRail()}

          {accountRailOnly ? null : (
            <AddServerMenu
              contextMenu={addServerMenu}
              activeHost={activeHost}
              joinedServerKeys={joinedServerKeys}
              onCreateServer={onCreateServer}
              onSearchServers={onSearchServers}
              onJoinServer={onJoinServer}
            />
          )}
        </div>

        {accountRailOnly ? null : <ServerRailSettingsMenu />}

        <ProfileSelector
          isAuthScreenOpen={accountRailOnly}
          onManageAccounts={onManageAccounts}
          onSelectAccount={onSelectAccount}
        />
      </div>

      {accountRailOnly ? null : (
        <div
          className="flex min-w-0 flex-1 flex-col bg-sidebar sm:flex-none"
          style={{ width: `${channelPanelWidth}px` }}
        >
          <div className="border-b border-sidebar-border/80 px-4 py-4">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <h2
                {...(selectedServer ? serverMenu.targetProps : {})}
                className="min-w-0 flex-1 truncate text-lg font-semibold text-sidebar-foreground"
              >
                {selectedServer ? (
                  <button
                    type="button"
                    className="block w-full cursor-pointer truncate rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    onClick={() => {
                      onOpenServerSettings(selectedServer.server);
                    }}
                  >
                    {selectedServer.server.title}
                  </button>
                ) : (
                  "Choose a server"
                )}
              </h2>
              {selectedServer ? (
                <ServerActionsMenu
                  contextMenu={serverMenu}
                  server={selectedServer.server}
                  onOpenServerSettings={onOpenServerSettings}
                  canCreateChannels={canManageServer(selectedServer.server)}
                  onCreateChannel={openCreateChannel}
                  onLeaveServer={(server) => {
                    setServerPendingLeave(server);
                  }}
                />
              ) : null}
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-sidebar-foreground/70">
              {selectedServer
                ? (selectedServer.server.description ?? "")
                : serverSelectionHint}
            </p>
          </div>

          <ChannelSection
            // Channel IDs are only unique on their host, so tree interaction
            // state starts over for each server
            key={shownServerKey ?? "none"}
            selectedServer={selectedServer}
            selectedChannelId={effectiveSelectedChannelId}
            collapsedIds={
              (shownServerKey === null
                ? undefined
                : collapsedIdsByServerKey[shownServerKey]) ?? NO_COLLAPSED_IDS
            }
            onCollapsedIdsChange={(update) => {
              if (shownServerKey === null) return;
              const key = shownServerKey;
              setCollapsedIdsByServerKey((current) => {
                const previous = current[key] ?? NO_COLLAPSED_IDS;
                const next = update(previous);
                return next === previous
                  ? current
                  : { ...current, [key]: next };
              });
            }}
            isLoading={isLoading}
            error={error}
            isSelectedServerHydrating={isSelectedServerHydrating}
            canManageChannels={canDeleteSelectedServer}
            onOpenCreateChannel={(kind, parentChannelId) => {
              if (selectedServer) {
                openCreateChannel(selectedServer.server, kind, parentChannelId);
              }
            }}
            onSelectChannel={(channel) => {
              scheduleSelectionCommit(
                {
                  serverKey: resourceKey(serverRefOf(channel)),
                  channelId: channel.id,
                },
                () => {
                  onSelectChannel(channel);
                }
              );
            }}
            onDeleteChannel={(channel) => {
              setChannelPendingDelete(channel);
            }}
            onMoveChannel={onMoveChannel}
            onEditChannel={onEditChannel}
          />
        </div>
      )}

      {accountRailOnly ? null : (
        <button
          type="button"
          className="group relative hidden w-3 shrink-0 cursor-col-resize items-stretch justify-center bg-sidebar/40 transition hover:bg-sidebar-accent/60 sm:flex"
          aria-label="Resize channels sidebar"
          onPointerDown={handleResizeStart}
        >
          <Separator
            orientation="vertical"
            className="bg-sidebar-border transition group-hover:bg-primary"
          />
        </button>
      )}

      <CreateChannelDialog
        request={createChannelRequest}
        serverTitle={createChannelRequest?.server.title ?? null}
        channels={createChannelServer?.channels ?? []}
        onOpenChange={(open) => {
          if (!open) {
            setCreateChannelRequest(null);
          }
        }}
        onCreateChannel={(kind, title, parentChannelId) => {
          // The dialog only opens for a request
          if (!createChannelRequest) return Effect.void;
          return onCreateChannel(
            createChannelRequest.server,
            kind,
            title,
            parentChannelId
          );
        }}
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
