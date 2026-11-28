import {
  cancelChannelNavigationPrefetch,
  rememberChannelNavigationHints,
  startChannelNavigationPrefetch,
} from "@/lib/channel-navigation-hints";
import { ChannelSettingsPage } from "@/components/channel-settings/ChannelSettingsPage";
import { channelServerRef, resourceKey, textChannelRef } from "@runelink/sdk";
import type {
  Message,
  ResourceKey,
  ResourceRef,
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
import { debugRunelink, reportRunelinkFailure } from "@/lib/runelink-debug";
import { sameResource, userRefKey } from "@/lib/runelink-store-utils";
import type { TextServerChannel } from "@/lib/runelink-store-utils";
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
  server: ResourceRef,
  setServerErrorByKey: Dispatch<SetStateAction<Record<ResourceKey, string>>>
) {
  return fetchServerWithChannels(server).pipe(
    Effect.catch((error) =>
      Effect.logWarning("Failed to load server", error).pipe(
        Effect.andThen(
          Effect.sync(() => {
            setServerErrorByKey((errors) => ({
              ...errors,
              [resourceKey(server)]:
                `Couldn't load channels from ${server.host}. ${requestFailureMessage(error)}`,
            }));
          })
        )
      )
    ),
    Effect.asVoid
  );
}

function handleMoveChannel(
  channel: ServerChannel,
  channelMove: ServerChannelMove
): RequestEffect<void> {
  return moveChannel(channel, channelMove).pipe(Effect.asVoid);
}

// Capture trace definitions once, while handlers still close over the current render.
const withCreateChannelSpan = Effect.fn("App.createChannel");
const withDeleteChannelSpan = Effect.fn("App.deleteChannel");
const withCreateServerSpan = Effect.fn("App.createServer");
const withJoinServerSpan = Effect.fn("App.joinServer");

export function App() {
  const pendingServerDetailsRef = useRef<Set<ResourceKey>>(new Set());
  const pendingMembersServerKeysRef = useRef<Set<ResourceKey>>(new Set());
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
  const [membersErrorByServerKey, setMembersErrorByServerKey] = useState<
    Record<ResourceKey, string>
  >({});
  const [isSidebarLoading, setIsSidebarLoading] = useState(false);
  const [resolvedSidebarAccountKey, setResolvedSidebarAccountKey] = useState<
    string | null
  >(null);
  const [sidebarError, setSidebarError] = useState<string | null>(null);
  const [serverErrorByKey, setServerErrorByKey] = useState<
    Record<ResourceKey, string>
  >({});

  const isWideLayout = useIsWideLayout();
  const activeAccount = useAtomValue(authAtom, getActiveAccount);
  // Only whether the active account is signed in matters here, not its
  // tokens, which refreshes in any tab replace.
  const isSignedIn = useAtomValue(
    authAtom,
    (state) => getActiveAccountAuth(state) !== null
  );
  const selectedServerRef = useAtomValue(
    navigationAtom,
    (state) => state.selectedServer
  );
  const selectedServerKey =
    selectedServerRef == null ? null : resourceKey(selectedServerRef);
  const selectedChannelIdByServerKey = useAtomValue(
    navigationAtom,
    (state) => state.selectedChannelIdByServerKey
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
  const membersByServerKey = useAtomValue(
    membershipsAtom,
    (state) => state.membersByServerKey
  );
  const hasFetchedMembersByServerKey = useAtomValue(
    membershipsAtom,
    (state) => state.hasFetchedMembersByServerKey
  );
  const isLoadingMembersByServerKey = useAtomValue(
    membershipsAtom,
    (state) => state.isLoadingByServerKey
  );
  const serverWithChannelsByKey = useAtomValue(
    serversAtom,
    (state) => state.serverWithChannelsByKey
  );
  const userByRefKey = useAtomValue(usersAtom, (state) => state.userByRefKey);

  const activeAccountKey = activeAccount
    ? `${activeAccount.name}@${activeAccount.host}`
    : null;
  const serverSettingsServerKey =
    route.screen === "server-settings" ? resourceKey(route.server) : null;

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
    setMembersErrorByServerKey({});
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
          server: route.server,
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
    startApp((message) => {
      toast(message);
    });
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
      return undefined;
    }

    const account = activeAccount;
    const currentRoute = getCurrentRoute();
    const prefetch = runFork(
      startChannelNavigationPrefetch(
        account,
        currentRoute.screen === "auth"
          ? (authReturnRouteRef.current ?? currentRoute)
          : currentRoute,
        getState(messagesAtom).messagesByTextChannelKey
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
        servers: memberships.map((membership) =>
          resourceKey(membership.server)
        ),
      });
      // A server that fails to load, such as on an unreachable peer host, is
      // shown from its membership until it loads, so it doesn't keep the
      // others from being used. The servers are reconciled with the route
      // from the memberships once the load finishes.
      yield* Effect.forEach(
        memberships,
        (membership) =>
          loadServerDetails(membership.server, setServerErrorByKey),
        { concurrency: "unbounded", discard: true }
      );
    });

    function startSidebarLoad() {
      setIsSidebarLoading(true);
      setResolvedSidebarAccountKey(null);
      setSidebarError(null);
      setServerErrorByKey({});
      void runPromise(
        loadSidebar.pipe(
          Effect.catch((error) =>
            Effect.sync(() => {
              if (!isCancelled) {
                reportRunelinkFailure("warn", "Failed to load servers", error);
                setSidebarError(requestFailureMessage(error));
                reconcileServers([]);
              }
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
      rememberChannelNavigationHints(activeAccount, serverWithChannelsByKey);
    }
  }, [activeAccount, isSignedIn, connectionStatus, serverWithChannelsByKey]);

  const activeMemberships = activeAccount
    ? membershipsByUserRefKey[userRefKey(activeAccount)]
    : undefined;

  const hydratedServers = useMemo(
    () =>
      (activeMemberships ?? []).map(
        (membership) =>
          serverWithChannelsByKey[resourceKey(membership.server)] ?? {
            server: membership.server,
            channels: [],
          }
      ),
    [activeMemberships, serverWithChannelsByKey]
  );

  const hydratedServerByKey: Record<ResourceKey, ServerWithChannels> = useMemo(
    () =>
      Object.fromEntries(
        hydratedServers.map((serverWithChannels) => [
          resourceKey(serverWithChannels.server),
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
      (membership) =>
        !(resourceKey(membership.server) in serverWithChannelsByKey)
    );
  }, [activeAccount, activeMemberships, serverWithChannelsByKey]);

  useEffect(() => {
    if (!activeAccount || connectionStatus !== "connected") {
      pendingServerDetailsRef.current.clear();
      return;
    }

    const membershipsToFetch = missingMembershipServers.filter(
      (membership) =>
        !pendingServerDetailsRef.current.has(resourceKey(membership.server))
    );

    if (membershipsToFetch.length === 0) {
      return;
    }

    for (const membership of membershipsToFetch) {
      const key = resourceKey(membership.server);
      pendingServerDetailsRef.current.add(key);
      void runPromise(
        loadServerDetails(membership.server, setServerErrorByKey).pipe(
          Effect.ensuring(
            Effect.sync(() => pendingServerDetailsRef.current.delete(key))
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
      activeAccountKey == null ||
      activeAccountKey === "" ||
      resolvedSidebarAccountKey !== activeAccountKey
    ) {
      return;
    }

    debugRunelink("hydrate sidebar servers", {
      selectedServerKey,
      hydratedServers: hydratedServers.map((server) =>
        resourceKey(server.server)
      ),
    });

    reconcileServers(hydratedServers);
  }, [
    activeAccountKey,
    hydratedServers,
    isSidebarLoading,
    reconcileServers,
    resolvedSidebarAccountKey,
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Reconcile the route when the stored channel selection changes.
    selectedChannelIdByServerKey,
    selectedServerKey,
  ]);

  const selectedChannelId =
    selectedServerKey == null
      ? null
      : (selectedChannelIdByServerKey[selectedServerKey] ?? null);

  const selectedServer =
    selectedServerKey == null
      ? null
      : (hydratedServerByKey[selectedServerKey] ?? null);
  const activeUser = activeAccount
    ? (userByRefKey[userRefKey(activeAccount)] ?? null)
    : null;
  function canManageServer(server: Server): boolean {
    return (
      activeUser?.role === "admin" ||
      activeMemberships?.some(
        (membership) =>
          sameResource(membership.server, server) && membership.role === "admin"
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
  function getServersError() {
    if (hasLoadedServers) return sidebarError;
    if (connectionStatus === "connected") return null;
    return connectionError;
  }

  const serversError = getServersError();
  const isServersLoading =
    !hasLoadedServers && (serversError == null || serversError === "");
  const hydratingServerKey =
    selectedServer != null &&
    selectedServerKey != null &&
    !(selectedServerKey in serverWithChannelsByKey)
      ? selectedServerKey
      : null;
  const isSelectedServerHydrating = hydratingServerKey != null;
  const selectedServerError =
    hydratingServerKey == null
      ? null
      : (serverErrorByKey[hydratingServerKey] ?? null);
  // Categories can't be opened, so only text channels count as selected
  const selectedChannel = selectedServer?.channels.find(
    (channel): channel is TextServerChannel =>
      channel.id === selectedChannelId && channel.kind === "text"
  );
  const serverSettingsServer =
    serverSettingsServerKey == null
      ? null
      : (hydratedServerByKey[serverSettingsServerKey] ?? null);
  const serverSettingsMembers =
    serverSettingsServerKey == null
      ? []
      : (membersByServerKey[serverSettingsServerKey] ?? []);
  const isServerSettingsOpen = serverSettingsServerKey != null;
  const isChannelSettingsOpen = route.screen === "channel-settings";
  const channelSettingsServer =
    route.screen === "channel-settings"
      ? (hydratedServerByKey[resourceKey(route.server)] ?? null)
      : null;
  const channelSettingsChannel =
    route.screen === "channel-settings"
      ? (channelSettingsServer?.channels.find(
          (channel) => channel.id === route.channelId
        ) ?? null)
      : null;
  const isChannelSettingsServerHydrating =
    channelSettingsServer !== null &&
    !(resourceKey(channelSettingsServer.server) in serverWithChannelsByKey);
  const channelSettingsError =
    serversError ??
    (isChannelSettingsServerHydrating
      ? (serverErrorByKey[resourceKey(channelSettingsServer.server)] ?? null)
      : null);
  const isLoadingServerSettingsMembers =
    serverSettingsServerKey == null
      ? false
      : (isLoadingMembersByServerKey[serverSettingsServerKey] ?? false);
  function getServerSettingsMembersError() {
    if (
      isServerSettingsOpen &&
      !isLoadingServerSettingsMembers &&
      !serverSettingsServer
    ) {
      return "Failed to load the selected server.";
    }
    if (serverSettingsServerKey != null) {
      return membersErrorByServerKey[serverSettingsServerKey] ?? null;
    }
    return null;
  }

  const serverSettingsMembersError = getServerSettingsMembersError();
  const membersServerKey = serverSettingsServerKey ?? selectedServerKey;
  const isChannelOpen = Boolean(selectedServer) && Boolean(selectedChannel);
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
    if (membersServerKey == null) return;

    const server = hydratedServerByKey[membersServerKey] ?? null;
    if (server == null) return;

    if (!activeAccount || connectionStatus !== "connected") {
      return;
    }

    if (
      hasFetchedMembersByServerKey[membersServerKey] ||
      pendingMembersServerKeysRef.current.has(membersServerKey) ||
      membersServerKey in membersErrorByServerKey
    ) {
      return;
    }

    pendingMembersServerKeysRef.current.add(membersServerKey);
    void runPromise(
      fetchMembersByServer(server.server).pipe(
        // Shown in the members list
        Effect.catch((error) =>
          Effect.sync(() => {
            setMembersErrorByServerKey((errors) => ({
              ...errors,
              [membersServerKey]: requestFailureMessage(error),
            }));
          })
        ),
        Effect.ensuring(
          Effect.sync(() =>
            pendingMembersServerKeysRef.current.delete(membersServerKey)
          )
        )
      )
    );
  }, [
    activeAccount,
    connectionStatus,
    hydratedServerByKey,
    hasFetchedMembersByServerKey,
    membersErrorByServerKey,
    membersServerKey,
  ]);

  const selectedTextChannel = useMemo(
    () => (selectedChannel ? textChannelRef(selectedChannel) : null),
    [selectedChannel]
  );
  const selectedTextChannelKey = selectedTextChannel
    ? resourceKey(selectedTextChannel)
    : null;
  // Background prefetches should not rerender the selected conversation.
  const selectedMessages =
    useAtomValue(messagesAtom, (state) =>
      selectedTextChannelKey === null
        ? undefined
        : state.messagesByTextChannelKey[selectedTextChannelKey]
    ) ?? EMPTY_MESSAGES;
  const isMessagesLoading = useAtomValue(messagesAtom, (state) =>
    selectedTextChannelKey === null
      ? false
      : (state.isLoadingByTextChannelKey[selectedTextChannelKey] ?? false)
  );
  const hasFetchedSelectedMessages = useAtomValue(messagesAtom, (state) =>
    selectedTextChannelKey === null
      ? false
      : (state.hasFetchedByTextChannelKey[selectedTextChannelKey] ?? false)
  );
  const messagesError = useAtomValue(messagesAtom, (state) =>
    selectedTextChannelKey === null
      ? null
      : (state.errorByTextChannelKey[selectedTextChannelKey] ?? null)
  );

  useEffect(() => {
    if (
      selectedTextChannel === null ||
      hasFetchedSelectedMessages ||
      connectionStatus !== "connected"
    ) {
      return;
    }

    void runPromise(
      fetchMessagesByTextChannel(selectedTextChannel).pipe(
        // The store shows the error in the message pane.
        Effect.ignore
      )
    );
  }, [connectionStatus, hasFetchedSelectedMessages, selectedTextChannel]);

  const connectedAccountKey = connectedAccount
    ? `${connectedAccount.name}@${connectedAccount.host}`
    : null;
  // Selecting a saved account (which prefills the form) returns once it is
  // ready, even if it was already active. Adding an account stays here until
  // a different account is ready.
  const switchedToReadyAccount =
    route.screen === "auth" &&
    Boolean(manageOriginAccountKey) &&
    Boolean(activeAccount) &&
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
  const selectedServerMemberList =
    selectedServer && selectedServerKey != null ? (
      <ServerMemberList
        server={selectedServer.server}
        members={membersByServerKey[selectedServerKey] ?? []}
        isLoading={isLoadingMembersByServerKey[selectedServerKey] ?? false}
        error={membersErrorByServerKey[selectedServerKey] ?? null}
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

  function handleSelectServer(server: ResourceRef) {
    const channelId = selectedChannelIdByServerKey[resourceKey(server)] ?? null;
    navigate(getContentRoute(server, channelId), "push");
  }

  function handleSelectChannel(channel: ServerChannel) {
    navigate(
      {
        screen: "channel",
        server: channelServerRef(channel),
        channelId: channel.id,
      },
      "push"
    );
  }

  function handleDeselectChannel() {
    if (!selectedServer) {
      return;
    }

    navigate({ screen: "server", server: selectedServer.server }, "push");
  }

  function handleOpenMembers() {
    if (
      selectedServerRef == null ||
      selectedChannelId == null ||
      selectedChannelId === ""
    ) {
      return;
    }

    navigate(
      {
        screen: "channel-members",
        server: selectedServerRef,
        channelId: selectedChannelId,
      },
      "push"
    );
  }

  function handleOpenChannelSettings(channel: ServerChannel) {
    navigate(
      {
        screen: "channel-settings",
        server: channelServerRef(channel),
        channelId: channel.id,
      },
      "push"
    );
  }

  function handleOpenServerSettings(server: ResourceRef) {
    navigate({ screen: "server-settings", server }, "push");
  }

  function handleBackToContent() {
    backOrReplace(getContentRoute(selectedServerRef, selectedChannelId));
  }

  function handleCloseAuthScreen() {
    authReturnRouteRef.current = null;
    setManageOriginAccountKey(null);
    setShouldPrefillAccount(true);
    backOrReplace(getContentRoute(selectedServerRef, selectedChannelId));
  }

  function handleSendMessage(
    body: string,
    replyTo: string | null
  ): RequestEffect<void> {
    if (!activeAccount || selectedTextChannel === null) {
      return Effect.void;
    }
    return createMessage(selectedTextChannel, {
      author: activeAccount,
      body,
      reply_to: replyTo,
    }).pipe(Effect.asVoid);
  }

  const handleCreateChannel = withCreateChannelSpan(function* (
    server: Server,
    kind: ServerChannelKind,
    title: string,
    parentChannelId: string | null
  ) {
    const channel = yield* createChannel(server, {
      kind,
      title,
      description: null,
      parent_channel_id: parentChannelId,
    });
    if (channel.kind !== "text") return;

    navigate({ screen: "channel", server, channelId: channel.id }, "push");
  });

  const handleDeleteChannel = withDeleteChannelSpan(function* (
    channel: ServerChannel
  ) {
    const serverRef = channelServerRef(channel);
    const server = hydratedServerByKey[resourceKey(serverRef)]?.server;
    const currentAccount = authAtom.pipe(getState, getActiveAccount);
    // The account changed, or the server was removed, since the
    // confirmation opened
    if (
      !activeAccount ||
      !currentAccount ||
      userRefKey(currentAccount) !== userRefKey(activeAccount) ||
      server == null
    ) {
      return yield* new SessionChangedError();
    }
    yield* deleteChannel(channel);
    const accountAfterDelete = authAtom.pipe(getState, getActiveAccount);
    if (
      !accountAfterDelete ||
      userRefKey(accountAfterDelete) !== userRefKey(activeAccount)
    ) {
      return undefined;
    }
    const current = getCurrentRoute();
    if (
      current.screen === "channel-settings" &&
      sameResource(current.server, serverRef) &&
      current.channelId === channel.id
    ) {
      navigate({ screen: "server", server: serverRef }, "replace");
    }
    return undefined;
  });

  const handleCreateServer = withCreateServerSpan(function* (
    host: string,
    title: string,
    description: string
  ) {
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
    yield* loadServerDetails(server, setServerErrorByKey);
    navigate({ screen: "server", server }, "push");
  });

  function handleSearchServers(host: string): RequestEffect<readonly Server[]> {
    if (!activeAccount) return Effect.succeed([]);
    return fetchServers(getTargetHost(host, activeAccount.host));
  }

  const handleJoinServer = withJoinServerSpan(function* (server: ResourceRef) {
    if (!activeAccount) return;

    debugRunelink("join server start", {
      server: resourceKey(server),
      activeAccount,
    });

    yield* upsertMembership({
      user_ref: activeAccount,
      server: { host: server.host, id: server.id },
      role: "member",
    });
    // The membership exists now, so a failed channel load shows in the
    // server's channel list rather than failing the join
    yield* loadServerDetails(server, setServerErrorByKey);
    debugRunelink("join server finished", {
      server: resourceKey(server),
      activeAccount,
    });
    navigate({ screen: "server", server }, "push");
  });

  function handleLeaveServer(server: ResourceRef): RequestEffect<void> {
    if (!activeAccount) return Effect.void;
    return deleteMembership(server, activeAccount);
  }

  function renderMainContent() {
    if (shouldShowAuthScreen) {
      return (
        <AuthScreen
          key={`${manageSessionId}:${activeAccount ? `${activeAccount.name}@${activeAccount.host}` : "no-account"}`}
          canClose={Boolean(activeAccount) && isSignedIn}
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
      );
    }
    if (route.screen === "channel-settings") {
      return (
        <ChannelSettingsPage
          key={`${activeAccountKey}:${resourceKey(route.server)}:${route.channelId}`}
          channel={channelSettingsChannel}
          isLoading={
            !(channelSettingsError != null && channelSettingsError !== "") &&
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
                    server: route.server,
                    channelId: route.channelId,
                  }
                : { screen: "server", server: route.server }
            );
          }}
          onDeleteChannel={handleDeleteChannel}
        />
      );
    }
    if (isServerSettingsOpen) {
      return (
        <ServerSettingsPage
          server={serverSettingsServer}
          members={serverSettingsMembers}
          isLoadingMembers={isLoadingServerSettingsMembers}
          membersError={serverSettingsMembersError}
          onDone={handleBackToContent}
        />
      );
    }
    if (isMembersPageOpen && selectedServer) {
      return (
        <ServerMembersPage
          serverTitle={selectedServer.server.title}
          onBack={handleBackToContent}
        >
          {selectedServerMemberList}
        </ServerMembersPage>
      );
    }
    return (
      <MessagesPane
        selectedServer={selectedServer}
        selectedChannel={selectedChannel}
        selectedMessages={selectedMessages}
        targetMessageId={
          route.screen === "channel" &&
          resourceKey(route.server) === selectedServerKey &&
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
        onDeleteMessage={deleteMessage}
        membersPane={isWideLayout ? selectedServerMemberList : null}
        onOpenMembers={handleOpenMembers}
      />
    );
  }

  function sidebarLayoutClass() {
    if (shouldShowAuthScreen) return "flex w-auto";
    if (isServerSettingsOpen || isChannelSettingsOpen) return "hidden";
    if (isChannelOpen) return "hidden sm:flex";
    return "flex w-full sm:w-auto";
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <div className={["min-w-0 shrink-0", sidebarLayoutClass()].join(" ")}>
        <Sidebar
          servers={hydratedServers}
          selectedServerKey={selectedServerKey}
          selectedChannelId={selectedChannelId}
          selectedChannelIdByServerKey={selectedChannelIdByServerKey}
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
          onOpenServerSettings={handleOpenServerSettings}
          onLeaveServer={handleLeaveServer}
          onDeleteServer={deleteServer}
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
          shouldShowAuthScreen ||
          isChannelOpen ||
          isServerSettingsOpen ||
          isChannelSettingsOpen
            ? "flex flex-1"
            : "hidden flex-1 sm:flex",
        ].join(" ")}
      >
        {renderMainContent()}
      </main>
    </div>
  );
}
