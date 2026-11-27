import {
  cancelChannelNavigationPrefetch,
  rememberChannelNavigationHints,
  startChannelNavigationPrefetch,
} from "@/lib/channel-navigation-hints";
import { ChannelSettingsPage } from "@/components/channel-settings/ChannelSettingsPage";
import type {
  Message,
  Server,
  ServerChannel,
  ServerChannelKind,
  ServerChannelMove,
  ServerWithChannels,
} from "@runelink/sdk";
import { useAtomValue } from "@effect/atom-react";
import * as Effect from "effect/Effect";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";
import { AuthScreen } from "@/components/AuthScreen";
import { ServerMemberList } from "@/components/members/ServerMemberList";
import { ServerMembersPage } from "@/components/members/ServerMembersPage";
import { MessagesPane } from "@/components/MessagesPane";
import { ServerSettingsPage } from "@/components/server-settings/ServerSettingsPage";
import { Sidebar } from "@/components/Sidebar";
import { getState } from "@/lib/atom-registry";
import {
  authAtom,
  getActiveAccount,
  getActiveAccountAuth,
  setAuthError,
} from "@/lib/auth-store";
import { getContentRoute } from "@/lib/app-route";
import type { AppRoute } from "@/lib/app-route";
import {
  createChannel,
  deleteChannel,
  moveChannel,
} from "@/lib/channels-store";
import { navigationAtom } from "@/lib/navigation-store";
import { requestFailureMessage } from "@/lib/request-failure";
import {
  cancelPendingAuthentication as cancelPendingAuthenticationEffect,
  connectionAtom,
  SessionChangedError,
} from "@/lib/runelink-session";
import type { RequestEffect } from "@/lib/runelink-session";
import {
  deleteMembership,
  fetchMembersByServer,
  fetchMembershipsByUser,
  membershipsAtom,
  upsertMembership,
} from "@/lib/memberships-store";
import {
  createMessage,
  deleteMessage,
  fetchMessagesByTextChannel,
  messagesAtom,
} from "@/lib/messages-store";
import { debugRunelink } from "@/lib/runelink-debug";
import { serverChannelKey, userRefKey } from "@/lib/runelink-store-utils";
import { runFork, runPromise, startApp } from "@/lib/runtime";
import {
  createServer,
  deleteServer,
  fetchServers,
  fetchServerWithChannels,
  serversAtom,
} from "@/lib/servers-store";
import { useAppNavigation } from "@/lib/use-app-navigation";
import { useIsWideLayout } from "@/lib/use-wide-layout";
import { fetchUserByRef, usersAtom } from "@/lib/users-store";

const EMPTY_MESSAGES: readonly Message[] = [];

function cancelPendingAuthentication() {
  runFork(cancelPendingAuthenticationEffect);
}

function getTargetHost(serverHost: string, activeHost: string): string | null {
  return serverHost === activeHost ? null : serverHost;
}

// Loads a server's channels. A failure, such as on an unreachable peer host,
// is recorded for the channel list rather than returned.
function loadServerDetails(
  serverId: string,
  serverHost: string,
  activeHost: string,
  setServerErrorById: Dispatch<SetStateAction<Record<string, string>>>
) {
  return fetchServerWithChannels(
    serverId,
    getTargetHost(serverHost, activeHost)
  ).pipe(
    Effect.catch((error) =>
      Effect.logWarning("Failed to load server", error).pipe(
        Effect.map(() => {
          setServerErrorById((errors) => ({
            ...errors,
            [serverId]: `Couldn't load channels from ${serverHost}. ${requestFailureMessage(error)}`,
          }));
        })
      )
    ),
    Effect.asVoid
  );
}

export function App() {
  const pendingServerDetailsRef = useRef<Set<string>>(new Set());
  const pendingMembersServerIdsRef = useRef<Set<string>>(new Set());
  const { route, navigate, getCurrentRoute, backOrReplace, reconcileServers } =
    useAppNavigation();
  const previousRouteRef = useRef(route);
  const authReturnRouteRef = useRef<AppRoute | null>(
    route.screen === "auth" ? null : route
  );
  const [manageSessionId, setManageSessionId] = useState(0);
  const [shouldPrefillAccount, setShouldPrefillAccount] = useState(true);
  const [manageOriginAccountKey, setManageOriginAccountKey] = useState<
    string | null
  >(null);
  const [membersErrorByServerId, setMembersErrorByServerId] = useState<
    Record<string, string>
  >({});
  const [isSidebarLoading, setIsSidebarLoading] = useState(false);
  const [resolvedSidebarAccountKey, setResolvedSidebarAccountKey] = useState<
    string | null
  >(null);
  const [sidebarError, setSidebarError] = useState<string | null>(null);
  const [serverErrorById, setServerErrorById] = useState<
    Record<string, string>
  >({});

  const isWideLayout = useIsWideLayout();
  const activeAccount = useAtomValue(authAtom, getActiveAccount);
  // Only whether the active account is signed in matters here, not its
  // tokens, which refreshes in any tab replace.
  const isSignedIn = useAtomValue(
    authAtom,
    (state) => getActiveAccountAuth(state) !== null
  );
  const selectedServerId = useAtomValue(
    navigationAtom,
    (state) => state.selectedServerId
  );
  const selectedChannelIdByServerId = useAtomValue(
    navigationAtom,
    (state) => state.selectedChannelIdByServerId
  );
  const connectionStatus = useAtomValue(
    connectionAtom,
    (state) => state.status
  );
  const connectedAccount = useAtomValue(
    connectionAtom,
    (state) => state.connectedAccount
  );
  const connectionError = useAtomValue(
    connectionAtom,
    (state) => state.lastError
  );
  const membershipsByUserRefKey = useAtomValue(
    membershipsAtom,
    (state) => state.membershipsByUserRefKey
  );
  const membersByServerId = useAtomValue(
    membershipsAtom,
    (state) => state.membersByServerId
  );
  const hasFetchedMembersByServerId = useAtomValue(
    membershipsAtom,
    (state) => state.hasFetchedMembersByServerId
  );
  const isLoadingMembersByServerId = useAtomValue(
    membershipsAtom,
    (state) => state.isLoadingByServerId
  );
  const serverWithChannelsById = useAtomValue(
    serversAtom,
    (state) => state.serverWithChannelsById
  );
  const userByRefKey = useAtomValue(usersAtom, (state) => state.userByRefKey);

  const activeAccountKey = activeAccount
    ? `${activeAccount.name}@${activeAccount.host}`
    : null;
  const serverSettingsServerId =
    route.screen === "server-settings" ? route.serverId : null;

  useEffect(() => {
    if (previousRouteRef.current.screen === "auth" && route.screen !== "auth") {
      cancelPendingAuthentication();
    }
    previousRouteRef.current = route;
  }, [route]);

  const [membersLoadContext, setMembersLoadContext] = useState({
    route,
    connectionStatus,
    activeAccountKey,
  });
  // Retry failed member loads after navigation, reconnects, or account changes.
  if (
    membersLoadContext.route !== route ||
    membersLoadContext.connectionStatus !== connectionStatus ||
    membersLoadContext.activeAccountKey !== activeAccountKey
  ) {
    setMembersLoadContext({ route, connectionStatus, activeAccountKey });
    setMembersErrorByServerId({});
  }

  if (route.screen !== "auth" && manageOriginAccountKey !== null) {
    setManageOriginAccountKey(null);
    setShouldPrefillAccount(true);
  }

  // Wide layouts show members beside the channel, so drop the members page
  // route to keep the pane toggle in charge
  useEffect(() => {
    if (isWideLayout && route.screen === "channel-members") {
      navigate(
        {
          screen: "channel",
          serverId: route.serverId,
          channelId: route.channelId,
        },
        "replace"
      );
    }
  }, [isWideLayout, navigate, route]);

  useEffect(() => {
    if ((!activeAccount || !isSignedIn) && route.screen !== "auth") {
      authReturnRouteRef.current = route;
      navigate({ screen: "auth" }, "replace");
    }
  }, [activeAccount, isSignedIn, navigate, route]);

  useEffect(() => {
    startApp(toast);
  }, []);

  if (
    (!activeAccount || !isSignedIn) &&
    (isSidebarLoading ||
      resolvedSidebarAccountKey !== null ||
      sidebarError !== null)
  ) {
    setIsSidebarLoading(false);
    setResolvedSidebarAccountKey(null);
    setSidebarError(null);
  }

  useEffect(() => {
    if (!activeAccount || !isSignedIn || connectionStatus !== "connected") {
      return;
    }

    const account = activeAccount;
    const currentRoute = getCurrentRoute();
    const prefetch = runFork(
      startChannelNavigationPrefetch(
        account,
        currentRoute.screen === "auth"
          ? (authReturnRouteRef.current ?? currentRoute)
          : currentRoute,
        getState(messagesAtom).messagesByTextChannelId
      )
    );
    const accountKey = `${account.name}@${account.host}`;
    let isCancelled = false;

    const loadSidebar = Effect.gen(function* () {
      const memberships = yield* fetchMembershipsByUser(account);
      // The account may have changed while the memberships loaded.
      if (isCancelled) return;
      debugRunelink("sidebar memberships loaded", {
        user: account,
        serverIds: memberships.map((membership) => membership.server.id),
      });
      // A server that fails to load, such as on an unreachable peer host, is
      // shown from its membership until it loads, so it doesn't keep the
      // others from being used. The servers are reconciled with the route
      // from the memberships once the load finishes.
      yield* Effect.forEach(
        memberships,
        (membership) =>
          loadServerDetails(
            membership.server.id,
            membership.server.host,
            account.host,
            setServerErrorById
          ),
        { concurrency: "unbounded", discard: true }
      );
    });

    function startSidebarLoad() {
      setIsSidebarLoading(true);
      setResolvedSidebarAccountKey(null);
      setSidebarError(null);
      setServerErrorById({});
      void runPromise(
        loadSidebar.pipe(
          Effect.catch((error) =>
            Effect.sync(() => {
              if (isCancelled) return;
              console.warn("Failed to load servers", error);
              setSidebarError(requestFailureMessage(error));
              reconcileServers([]);
            })
          ),
          Effect.ensuring(
            Effect.sync(() => {
              if (isCancelled) return;
              setIsSidebarLoading(false);
              setResolvedSidebarAccountKey(accountKey);
            })
          )
        )
      );
    }

    startSidebarLoad();

    return () => {
      isCancelled = true;
      prefetch.interruptUnsafe();
      cancelChannelNavigationPrefetch();
    };
  }, [
    activeAccount,
    isSignedIn,
    connectionStatus,
    getCurrentRoute,
    reconcileServers,
  ]);

  useEffect(() => {
    if (activeAccount && isSignedIn && connectionStatus === "connected") {
      rememberChannelNavigationHints(activeAccount, serverWithChannelsById);
    }
  }, [activeAccount, isSignedIn, connectionStatus, serverWithChannelsById]);

  const activeMemberships = activeAccount
    ? membershipsByUserRefKey[userRefKey(activeAccount)]
    : undefined;

  const hydratedServers = useMemo(
    () =>
      (activeMemberships ?? [])
        .map(
          (membership) =>
            serverWithChannelsById[membership.server.id] ?? {
              server: membership.server,
              channels: [],
            }
        )
        .filter((value): value is ServerWithChannels => value !== undefined),
    [activeMemberships, serverWithChannelsById]
  );

  const hydratedServerById = useMemo(
    () =>
      Object.fromEntries(
        hydratedServers.map((serverWithChannels) => [
          serverWithChannels.server.id,
          serverWithChannels,
        ])
      ),
    [hydratedServers]
  );

  const missingMembershipServers = useMemo(() => {
    if (!activeAccount || !activeMemberships) {
      return [];
    }

    return activeMemberships.filter(
      (membership) => !(membership.server.id in serverWithChannelsById)
    );
  }, [activeAccount, activeMemberships, serverWithChannelsById]);

  useEffect(() => {
    if (!activeAccount || connectionStatus !== "connected") {
      pendingServerDetailsRef.current.clear();
      return;
    }

    const membershipsToFetch = missingMembershipServers.filter(
      (membership) => !pendingServerDetailsRef.current.has(membership.server.id)
    );

    if (membershipsToFetch.length === 0) {
      return;
    }

    for (const membership of membershipsToFetch) {
      pendingServerDetailsRef.current.add(membership.server.id);
      void runPromise(
        loadServerDetails(
          membership.server.id,
          membership.server.host,
          activeAccount.host,
          setServerErrorById
        ).pipe(
          Effect.ensuring(
            Effect.sync(() =>
              pendingServerDetailsRef.current.delete(membership.server.id)
            )
          )
        )
      );
    }
  }, [activeAccount, connectionStatus, missingMembershipServers]);

  useEffect(() => {
    if (!activeAccount || connectionStatus !== "connected") {
      return;
    }
    const activeUserKey = userRefKey(activeAccount);
    if (activeUserKey in userByRefKey) {
      return;
    }
    void runPromise(
      fetchUserByRef(activeAccount).pipe(
        Effect.catch((error) =>
          Effect.logWarning("Failed to load the active user", error)
        )
      )
    );
  }, [activeAccount, connectionStatus, userByRefKey]);

  useEffect(() => {
    if (
      isSidebarLoading ||
      !activeAccountKey ||
      resolvedSidebarAccountKey !== activeAccountKey
    ) {
      return;
    }

    debugRunelink("hydrate sidebar servers", {
      selectedServerId,
      hydratedServerIds: hydratedServers.map((server) => server.server.id),
    });

    reconcileServers(hydratedServers);
  }, [
    activeAccountKey,
    hydratedServers,
    isSidebarLoading,
    reconcileServers,
    resolvedSidebarAccountKey,
    selectedChannelIdByServerId,
    selectedServerId,
  ]);

  const selectedChannelId = selectedServerId
    ? (selectedChannelIdByServerId[selectedServerId] ?? null)
    : null;

  const selectedServer = selectedServerId
    ? (hydratedServerById[selectedServerId] ?? null)
    : null;
  const activeUser = activeAccount
    ? (userByRefKey[userRefKey(activeAccount)] ?? null)
    : null;
  function canManageServer(server: Server): boolean {
    return (
      activeUser?.role === "admin" ||
      activeMemberships?.some(
        (membership) =>
          membership.server.id === server.id && membership.role === "admin"
      ) === true
    );
  }
  const canDeleteSelectedServer = selectedServer
    ? canManageServer(selectedServer.server)
    : false;
  const canModerateSelectedMessages = canDeleteSelectedServer;
  // The servers stay loading until their load for the active account
  // finishes, which can't start while the host is unreachable
  const hasLoadedServers = resolvedSidebarAccountKey === activeAccountKey;
  const serversError = hasLoadedServers
    ? sidebarError
    : connectionStatus === "connected"
      ? null
      : connectionError;
  const isServersLoading = !hasLoadedServers && !serversError;
  const selectedServerError =
    selectedServer && !(selectedServer.server.id in serverWithChannelsById)
      ? (serverErrorById[selectedServer.server.id] ?? null)
      : null;
  const isSelectedServerHydrating = selectedServer
    ? !(selectedServer.server.id in serverWithChannelsById)
    : false;
  // Categories can't be opened, so only text channels count as selected
  const selectedChannel = selectedServer?.channels.find(
    (channel) => channel.id === selectedChannelId && channel.kind === "text"
  );
  const serverSettingsServer = serverSettingsServerId
    ? (hydratedServerById[serverSettingsServerId] ?? null)
    : null;
  const serverSettingsMembers = serverSettingsServerId
    ? (membersByServerId[serverSettingsServerId] ?? [])
    : [];
  const isServerSettingsOpen = !!serverSettingsServerId;
  const isChannelSettingsOpen = route.screen === "channel-settings";
  const channelSettingsServer =
    route.screen === "channel-settings"
      ? (hydratedServerById[route.serverId] ?? null)
      : null;
  const channelSettingsChannel =
    route.screen === "channel-settings"
      ? (channelSettingsServer?.channels.find(
          (channel) => channel.id === route.channelId
        ) ?? null)
      : null;
  const isChannelSettingsServerHydrating =
    !!channelSettingsServer &&
    !(channelSettingsServer.server.id in serverWithChannelsById);
  const channelSettingsError =
    serversError ??
    (isChannelSettingsServerHydrating
      ? (serverErrorById[channelSettingsServer.server.id] ?? null)
      : null);
  const isLoadingServerSettingsMembers = serverSettingsServerId
    ? (isLoadingMembersByServerId[serverSettingsServerId] ?? false)
    : false;
  const serverSettingsMembersError =
    isServerSettingsOpen &&
    !isLoadingServerSettingsMembers &&
    !serverSettingsServer
      ? "Failed to load the selected server."
      : serverSettingsServerId
        ? (membersErrorByServerId[serverSettingsServerId] ?? null)
        : null;
  const membersServerId = serverSettingsServerId ?? selectedServerId;
  const isChannelOpen = !!selectedServer && !!selectedChannel;
  // Wide layouts show members beside the channel instead of on their own page
  const isMembersPageOpen =
    route.screen === "channel-members" && isChannelOpen && !isWideLayout;

  useEffect(() => {
    if (route.screen === "auth") {
      document.title = "Account | RuneLink";
      return;
    }

    if (isChannelSettingsOpen && channelSettingsChannel) {
      document.title = `${channelSettingsChannel.title} Settings | RuneLink`;
      return;
    }

    if (isServerSettingsOpen && serverSettingsServer) {
      document.title = `${serverSettingsServer.server.title} Settings | RuneLink`;
      return;
    }

    if (!selectedServer) {
      document.title = "RuneLink";
      return;
    }

    if (!selectedChannel) {
      document.title = selectedServer.server.title;
      return;
    }

    if (isMembersPageOpen) {
      document.title = `Members | ${selectedServer.server.title}`;
      return;
    }

    document.title = `#${selectedChannel.title} | ${selectedServer.server.title}`;
  }, [
    isMembersPageOpen,
    isChannelSettingsOpen,
    channelSettingsChannel,
    isServerSettingsOpen,
    route.screen,
    selectedChannel,
    selectedServer,
    serverSettingsServer,
  ]);

  useEffect(() => {
    if (!membersServerId) {
      return;
    }

    const server = hydratedServerById[membersServerId] ?? null;
    if (!server) {
      return;
    }

    if (!activeAccount || connectionStatus !== "connected") {
      return;
    }

    if (
      hasFetchedMembersByServerId[membersServerId] ||
      pendingMembersServerIdsRef.current.has(membersServerId) ||
      membersServerId in membersErrorByServerId
    ) {
      return;
    }

    pendingMembersServerIdsRef.current.add(membersServerId);
    void runPromise(
      fetchMembersByServer(
        membersServerId,
        getTargetHost(server.server.host, activeAccount.host)
      ).pipe(
        // Shown in the members list
        Effect.catch((error) =>
          Effect.sync(() => {
            setMembersErrorByServerId((errors) => ({
              ...errors,
              [membersServerId]: requestFailureMessage(error),
            }));
          })
        ),
        Effect.ensuring(
          Effect.sync(() =>
            pendingMembersServerIdsRef.current.delete(membersServerId)
          )
        )
      )
    );
  }, [
    activeAccount,
    connectionStatus,
    hydratedServerById,
    hasFetchedMembersByServerId,
    membersErrorByServerId,
    membersServerId,
  ]);

  const selectedChannelKey =
    selectedServerId && selectedChannelId
      ? serverChannelKey(selectedServerId, selectedChannelId)
      : null;
  const selectedTextChannelId =
    selectedChannel?.kind === "text" ? selectedChannel.text_channel_id : null;
  // Background prefetches should not rerender the selected conversation.
  const selectedMessages =
    useAtomValue(messagesAtom, (state) =>
      selectedTextChannelId
        ? state.messagesByTextChannelId[selectedTextChannelId]
        : undefined
    ) ?? EMPTY_MESSAGES;
  const isMessagesLoading = useAtomValue(messagesAtom, (state) =>
    selectedTextChannelId
      ? (state.isLoadingByTextChannelId[selectedTextChannelId] ?? false)
      : false
  );
  const hasFetchedSelectedMessages = useAtomValue(messagesAtom, (state) =>
    selectedTextChannelId
      ? (state.hasFetchedByTextChannelId[selectedTextChannelId] ?? false)
      : false
  );
  const messagesError = useAtomValue(messagesAtom, (state) =>
    selectedTextChannelId
      ? (state.errorByTextChannelId[selectedTextChannelId] ?? null)
      : null
  );

  useEffect(() => {
    if (
      !selectedTextChannelId ||
      hasFetchedSelectedMessages ||
      connectionStatus !== "connected" ||
      !selectedServer ||
      !activeAccount
    ) {
      return;
    }

    void runPromise(
      fetchMessagesByTextChannel(
        selectedTextChannelId,
        getTargetHost(selectedServer.server.host, activeAccount.host)
      ).pipe(
        // The store shows the error in the message pane.
        Effect.ignore
      )
    );
  }, [
    activeAccount,
    connectionStatus,
    hasFetchedSelectedMessages,
    selectedServer,
    selectedTextChannelId,
  ]);

  const connectedAccountKey = connectedAccount
    ? `${connectedAccount.name}@${connectedAccount.host}`
    : null;
  // Selecting a saved account (which prefills the form) returns once it is
  // ready, even if it was already active. Adding an account stays here until
  // a different account is ready.
  const switchedToReadyAccount =
    route.screen === "auth" &&
    !!manageOriginAccountKey &&
    !!activeAccount &&
    isSignedIn &&
    (shouldPrefillAccount || activeAccountKey !== manageOriginAccountKey) &&
    connectedAccountKey === activeAccountKey &&
    connectionStatus === "connected";

  useEffect(() => {
    if (!switchedToReadyAccount) {
      return;
    }
    const destination: AppRoute = authReturnRouteRef.current ?? {
      screen: "home",
    };
    authReturnRouteRef.current = null;
    navigate(destination, "push");
  }, [navigate, switchedToReadyAccount]);

  const shouldShowAuthScreen =
    route.screen === "auth" || !activeAccount || !isSignedIn;
  const selectedServerMemberList = selectedServer ? (
    <ServerMemberList
      serverId={selectedServer.server.id}
      serverHost={selectedServer.server.host}
      members={membersByServerId[selectedServer.server.id] ?? []}
      isLoading={isLoadingMembersByServerId[selectedServer.server.id] ?? false}
      error={membersErrorByServerId[selectedServer.server.id] ?? null}
      canModerateMembers={canDeleteSelectedServer}
    />
  ) : null;

  function handleOpenAuth(prefillAccount: boolean) {
    cancelPendingAuthentication();
    // Cleared here rather than by the auth screen, so the reason a session
    // ended stays visible when the app opens the screen itself
    setAuthError(null);
    const currentRoute = getCurrentRoute();
    if (currentRoute.screen !== "auth") {
      authReturnRouteRef.current = currentRoute;
    }
    setManageOriginAccountKey(activeAccountKey);
    setShouldPrefillAccount(prefillAccount);
    setManageSessionId((value) => value + 1);
    navigate({ screen: "auth" }, "push");
  }

  function handleSelectServer(serverId: string) {
    const channelId = selectedChannelIdByServerId[serverId] ?? null;
    navigate(getContentRoute(serverId, channelId), "push");
  }

  function handleSelectChannel(serverId: string, channel: ServerChannel) {
    navigate({ screen: "channel", serverId, channelId: channel.id }, "push");
  }

  function handleDeselectChannel() {
    if (!selectedServer) {
      return;
    }

    navigate({ screen: "server", serverId: selectedServer.server.id }, "push");
  }

  function handleOpenMembers() {
    if (!selectedServerId || !selectedChannelId) {
      return;
    }

    navigate(
      {
        screen: "channel-members",
        serverId: selectedServerId,
        channelId: selectedChannelId,
      },
      "push"
    );
  }

  function handleOpenChannelSettings(channel: ServerChannel) {
    navigate(
      {
        screen: "channel-settings",
        serverId: channel.server_id,
        channelId: channel.id,
      },
      "push"
    );
  }

  function handleOpenServerSettings(serverId: string) {
    navigate({ screen: "server-settings", serverId }, "push");
  }

  function handleBackToContent() {
    backOrReplace(getContentRoute(selectedServerId, selectedChannelId));
  }

  function handleCloseAuthScreen() {
    authReturnRouteRef.current = null;
    setManageOriginAccountKey(null);
    setShouldPrefillAccount(true);
    backOrReplace(getContentRoute(selectedServerId, selectedChannelId));
  }

  function handleSendMessage(
    body: string,
    replyTo: string | null
  ): RequestEffect<void> {
    if (!activeAccount || !selectedServer || !selectedTextChannelId) {
      return Effect.void;
    }
    return createMessage(
      selectedTextChannelId,
      {
        author: activeAccount,
        body,
        reply_to: replyTo,
      },
      getTargetHost(selectedServer.server.host, activeAccount.host)
    ).pipe(Effect.asVoid);
  }

  function handleDeleteMessage(message: Message): RequestEffect<void> {
    if (!activeAccount || !selectedServer || !selectedTextChannelId) {
      return Effect.void;
    }
    return deleteMessage(
      selectedTextChannelId,
      message.id,
      getTargetHost(selectedServer.server.host, activeAccount.host)
    );
  }

  function handleCreateChannel(
    server: Server,
    kind: ServerChannelKind,
    title: string,
    parentChannelId: string | null
  ): RequestEffect<void> {
    return Effect.gen(function* () {
      if (!activeAccount) {
        return;
      }
      const channel = yield* createChannel(
        server.id,
        {
          kind,
          title,
          description: null,
          parent_channel_id: parentChannelId,
        },
        getTargetHost(server.host, activeAccount.host)
      );
      if (channel.kind !== "text") {
        return;
      }

      navigate(
        {
          screen: "channel",
          serverId: server.id,
          channelId: channel.id,
        },
        "push"
      );
    });
  }

  function handleDeleteChannel(channel: ServerChannel): RequestEffect<void> {
    return Effect.gen(function* () {
      const server = hydratedServerById[channel.server_id]?.server;
      const currentAccount = getActiveAccount(getState(authAtom));
      // The account changed, or the server was removed, since the
      // confirmation opened
      if (
        !activeAccount ||
        !currentAccount ||
        userRefKey(currentAccount) !== userRefKey(activeAccount) ||
        !server
      ) {
        return yield* new SessionChangedError();
      }
      yield* deleteChannel(
        channel.server_id,
        channel.id,
        getTargetHost(server.host, activeAccount.host)
      );
      const accountAfterDelete = getActiveAccount(getState(authAtom));
      if (
        !accountAfterDelete ||
        userRefKey(accountAfterDelete) !== userRefKey(activeAccount)
      ) {
        return;
      }
      const current = getCurrentRoute();
      if (
        current.screen === "channel-settings" &&
        current.serverId === channel.server_id &&
        current.channelId === channel.id
      ) {
        navigate({ screen: "server", serverId: channel.server_id }, "replace");
      }
    });
  }

  function handleMoveChannel(
    channel: ServerChannel,
    channelMove: ServerChannelMove
  ): RequestEffect<void> {
    if (!activeAccount || !selectedServer) return Effect.void;
    return moveChannel(
      selectedServer.server.id,
      channel.id,
      channelMove,
      getTargetHost(selectedServer.server.host, activeAccount.host)
    ).pipe(Effect.asVoid);
  }

  function handleCreateServer(
    host: string,
    title: string,
    description: string
  ): RequestEffect<void> {
    return Effect.gen(function* () {
      if (!activeAccount) return;

      const targetHost = getTargetHost(host.trim(), activeAccount.host);
      const server = yield* createServer(
        {
          title,
          description: description.trim() || null,
          default_channels: true,
        },
        targetHost
      );

      // The server exists now, so a failed channel load shows in its channel
      // list rather than failing the create
      yield* loadServerDetails(
        server.id,
        server.host,
        activeAccount.host,
        setServerErrorById
      );
      navigate({ screen: "server", serverId: server.id }, "push");
    });
  }

  function handleSearchServers(host: string): RequestEffect<readonly Server[]> {
    if (!activeAccount) return Effect.succeed([]);
    return fetchServers(getTargetHost(host, activeAccount.host));
  }

  function handleJoinServer(
    serverId: string,
    serverHost: string
  ): RequestEffect<void> {
    return Effect.gen(function* () {
      if (!activeAccount) return;

      debugRunelink("join server start", {
        serverId,
        serverHost,
        activeAccount,
      });

      yield* upsertMembership(serverId, {
        user_ref: activeAccount,
        server_id: serverId,
        server_host: serverHost,
        role: "member",
      });
      // The membership exists now, so a failed channel load shows in the
      // server's channel list rather than failing the join
      yield* loadServerDetails(
        serverId,
        serverHost,
        activeAccount.host,
        setServerErrorById
      );
      debugRunelink("join server finished", {
        serverId,
        serverHost,
        activeAccount,
      });
      navigate({ screen: "server", serverId }, "push");
    });
  }

  function handleLeaveServer(
    serverId: string,
    serverHost: string
  ): RequestEffect<void> {
    if (!activeAccount) return Effect.void;
    return deleteMembership(
      serverId,
      activeAccount,
      getTargetHost(serverHost, activeAccount.host)
    );
  }

  function handleDeleteServer(
    serverId: string,
    serverHost: string
  ): RequestEffect<void> {
    if (!activeAccount) return Effect.void;
    return deleteServer(
      serverId,
      getTargetHost(serverHost, activeAccount.host)
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <div
        className={[
          "min-w-0 shrink-0",
          shouldShowAuthScreen
            ? "flex w-auto"
            : isServerSettingsOpen || isChannelSettingsOpen
              ? "hidden"
              : isChannelOpen
                ? "hidden sm:flex"
                : "flex w-full sm:w-auto",
        ].join(" ")}
      >
        <Sidebar
          servers={hydratedServers}
          selectedServerId={selectedServerId}
          selectedChannelId={selectedChannelId}
          selectedChannelIdByServerId={selectedChannelIdByServerId}
          isLoading={isServersLoading}
          error={serversError ?? selectedServerError}
          isSelectedServerHydrating={isSelectedServerHydrating}
          activeHost={activeAccount?.host ?? null}
          accountRailOnly={shouldShowAuthScreen}
          onManageAccounts={() => {
            handleOpenAuth(false);
          }}
          onSelectAccount={() => {
            handleOpenAuth(true);
          }}
          onSelectServer={handleSelectServer}
          onSelectChannel={handleSelectChannel}
          onCreateServer={handleCreateServer}
          onSearchServers={handleSearchServers}
          onJoinServer={handleJoinServer}
          onOpenServerSettings={(server) => {
            handleOpenServerSettings(server.id);
          }}
          onLeaveServer={handleLeaveServer}
          onDeleteServer={handleDeleteServer}
          canDeleteSelectedServer={canDeleteSelectedServer}
          canManageServer={canManageServer}
          onCreateChannel={handleCreateChannel}
          onDeleteChannel={handleDeleteChannel}
          onEditChannel={handleOpenChannelSettings}
          onMoveChannel={handleMoveChannel}
        />
      </div>

      <main
        className={[
          "min-h-0 min-w-0 overflow-hidden",
          shouldShowAuthScreen
            ? "flex flex-1"
            : isChannelOpen || isServerSettingsOpen || isChannelSettingsOpen
              ? "flex flex-1"
              : "hidden flex-1 sm:flex",
        ].join(" ")}
      >
        {shouldShowAuthScreen ? (
          <AuthScreen
            key={`${manageSessionId}:${activeAccount ? `${activeAccount.name}@${activeAccount.host}` : "no-account"}`}
            canClose={!!activeAccount && isSignedIn}
            prefillAccount={shouldPrefillAccount}
            onDone={() => {
              setManageOriginAccountKey(null);
              setShouldPrefillAccount(true);
              const destination: AppRoute = authReturnRouteRef.current ?? {
                screen: "home",
              };
              authReturnRouteRef.current = null;
              navigate(destination, "push");
            }}
            onBack={handleCloseAuthScreen}
          />
        ) : route.screen === "channel-settings" ? (
          <ChannelSettingsPage
            key={`${activeAccountKey}:${route.serverId}:${route.channelId}`}
            channel={channelSettingsChannel}
            host={channelSettingsServer?.server.host ?? null}
            isLoading={
              !channelSettingsError &&
              (isServersLoading || isChannelSettingsServerHydrating)
            }
            error={channelSettingsError}
            canManage={
              channelSettingsServer
                ? canManageServer(channelSettingsServer.server)
                : false
            }
            onDone={() => {
              backOrReplace(
                channelSettingsChannel?.kind === "text"
                  ? {
                      screen: "channel",
                      serverId: route.serverId,
                      channelId: route.channelId,
                    }
                  : { screen: "server", serverId: route.serverId }
              );
            }}
            onDeleteChannel={handleDeleteChannel}
          />
        ) : isServerSettingsOpen ? (
          <ServerSettingsPage
            server={serverSettingsServer}
            members={serverSettingsMembers}
            isLoadingMembers={isLoadingServerSettingsMembers}
            membersError={serverSettingsMembersError}
            onDone={handleBackToContent}
          />
        ) : isMembersPageOpen && selectedServer ? (
          <ServerMembersPage
            serverTitle={selectedServer.server.title}
            onBack={handleBackToContent}
          >
            {selectedServerMemberList}
          </ServerMembersPage>
        ) : (
          <MessagesPane
            selectedServer={selectedServer}
            selectedChannel={selectedChannel}
            selectedChannelKey={selectedChannelKey}
            selectedMessages={selectedMessages}
            targetMessageId={
              route.screen === "channel" &&
              route.serverId === selectedServer?.server.id &&
              route.channelId === selectedChannel?.id
                ? (route.messageId ?? null)
                : null
            }
            hasLoadedMessages={hasFetchedSelectedMessages}
            isSidebarLoading={isServersLoading}
            sidebarError={serversError}
            hydratedServerCount={hydratedServers.length}
            isMessagesLoading={isMessagesLoading}
            messagesError={messagesError}
            activeAccount={activeAccount}
            canModerateMessages={canModerateSelectedMessages}
            canModerateMembers={canDeleteSelectedServer}
            canDeleteChannel={canDeleteSelectedServer}
            onDeselectChannel={handleDeselectChannel}
            onSendMessage={handleSendMessage}
            onDeleteChannel={handleDeleteChannel}
            onEditChannel={handleOpenChannelSettings}
            onDeleteMessage={handleDeleteMessage}
            membersPane={isWideLayout ? selectedServerMemberList : null}
            onOpenMembers={handleOpenMembers}
          />
        )}
      </main>
    </div>
  );
}

export default App;
