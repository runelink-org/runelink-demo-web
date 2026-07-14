import type { Channel, Message, ServerWithChannels } from "@runelink/sdk";
import { useEffect, useMemo, useRef, useState } from "react";
import { AuthScreen } from "@/components/AuthScreen";
import { MessagesPane } from "@/components/MessagesPane";
import { ServerSettingsPage } from "@/components/server-settings/ServerSettingsPage";
import { Sidebar } from "@/components/Sidebar";
import {
  getActiveAccount,
  getActiveAccountAuth,
  useAuthStore,
} from "@/lib/auth-store";
import { type AppRoute, getContentRoute } from "@/lib/app-route";
import { useChannelsStore } from "@/lib/channels-store";
import { useNavigationStore } from "@/lib/navigation-store";
import {
  cancelPendingAuthentication,
  initializeRunelinkConnectionStore,
  useRunelinkConnectionStore,
} from "@/lib/runelink-connection-store";
import { useMembershipsStore } from "@/lib/memberships-store";
import { useMessagesStore } from "@/lib/messages-store";
import { debugRunelink } from "@/lib/runelink-debug";
import { serverChannelKey, userRefKey } from "@/lib/runelink-store-utils";
import { useServersStore } from "@/lib/servers-store";
import { useAppNavigation } from "@/lib/use-app-navigation";
import { useUsersStore } from "@/lib/users-store";

function getTargetHost(serverHost: string, activeHost: string): string | null {
  return serverHost === activeHost ? null : serverHost;
}

export function App() {
  const pendingServerDetailsRef = useRef<Set<string>>(new Set());
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
  const [serverSettingsError, setServerSettingsError] = useState<string | null>(
    null
  );
  const [isSidebarLoading, setIsSidebarLoading] = useState(false);
  const [resolvedSidebarAccountKey, setResolvedSidebarAccountKey] = useState<
    string | null
  >(null);
  const [sidebarError, setSidebarError] = useState<string | null>(null);

  const activeAccount = useAuthStore(getActiveAccount);
  const activeAuth = useAuthStore(getActiveAccountAuth);
  const selectedServerId = useNavigationStore(
    (state) => state.selectedServerId
  );
  const selectedChannelIdByServerId = useNavigationStore(
    (state) => state.selectedChannelIdByServerId
  );
  const connectionStatus = useRunelinkConnectionStore((state) => state.status);
  const connectedAccount = useRunelinkConnectionStore(
    (state) => state.connectedAccount
  );
  const membershipsByUserRefKey = useMembershipsStore(
    (state) => state.membershipsByUserRefKey
  );
  const fetchMembershipsByUser = useMembershipsStore(
    (state) => state.fetchMembershipsByUser
  );
  const membersByServerId = useMembershipsStore(
    (state) => state.membersByServerId
  );
  const hasFetchedMembersByServerId = useMembershipsStore(
    (state) => state.hasFetchedMembersByServerId
  );
  const isLoadingMembersByServerId = useMembershipsStore(
    (state) => state.isLoadingByServerId
  );
  const fetchMembersByServer = useMembershipsStore(
    (state) => state.fetchMembersByServer
  );
  const upsertMembership = useMembershipsStore(
    (state) => state.upsertMembership
  );
  const deleteMembership = useMembershipsStore(
    (state) => state.deleteMembership
  );
  const serverWithChannelsById = useServersStore(
    (state) => state.serverWithChannelsById
  );
  const fetchServers = useServersStore((state) => state.fetchServers);
  const fetchServerWithChannels = useServersStore(
    (state) => state.fetchServerWithChannels
  );
  const createServer = useServersStore((state) => state.createServer);
  const deleteServer = useServersStore((state) => state.deleteServer);
  const userByRefKey = useUsersStore((state) => state.userByRefKey);
  const fetchUserByRef = useUsersStore((state) => state.fetchUserByRef);
  const createChannel = useChannelsStore((state) => state.createChannel);
  const deleteChannel = useChannelsStore((state) => state.deleteChannel);
  const messagesByChannelKey = useMessagesStore(
    (state) => state.messagesByChannelKey
  );
  const isLoadingByChannelKey = useMessagesStore(
    (state) => state.isLoadingByChannelKey
  );
  const errorByChannelKey = useMessagesStore(
    (state) => state.errorByChannelKey
  );
  const fetchMessagesByChannel = useMessagesStore(
    (state) => state.fetchMessagesByChannel
  );
  const createMessage = useMessagesStore((state) => state.createMessage);
  const deleteMessage = useMessagesStore((state) => state.deleteMessage);

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

    setServerSettingsError(null);
  }, [route]);

  useEffect(() => {
    if ((!activeAccount || !activeAuth) && route.screen !== "auth") {
      authReturnRouteRef.current = route;
      navigate({ screen: "auth" }, "replace");
    }
  }, [activeAccount, activeAuth, navigate, route]);

  useEffect(() => {
    initializeRunelinkConnectionStore();
  }, []);

  useEffect(() => {
    if (!activeAccount || !activeAuth) {
      setIsSidebarLoading(false);
      setResolvedSidebarAccountKey(null);
      setSidebarError(null);
    }
  }, [activeAccount, activeAuth]);

  useEffect(() => {
    if (!activeAccount || !activeAuth || connectionStatus !== "connected") {
      return;
    }

    const account = activeAccount;
    const accountKey = `${account.name}@${account.host}`;
    let isCancelled = false;

    async function loadSidebar() {
      setIsSidebarLoading(true);
      setResolvedSidebarAccountKey(null);
      setSidebarError(null);

      try {
        const memberships = await fetchMembershipsByUser(account);
        debugRunelink("sidebar memberships loaded", {
          user: account,
          serverIds: memberships.map((membership) => membership.server.id),
        });
        const fullServers = await Promise.all(
          memberships.map((membership) =>
            fetchServerWithChannels(
              membership.server.id,
              getTargetHost(membership.server.host, account.host)
            )
          )
        );

        if (isCancelled) {
          return;
        }

        reconcileServers(fullServers);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setSidebarError(
          error instanceof Error ? error.message : "Failed to load servers"
        );
        reconcileServers([]);
      } finally {
        if (!isCancelled) {
          setIsSidebarLoading(false);
          setResolvedSidebarAccountKey(accountKey);
        }
      }
    }

    void loadSidebar();

    return () => {
      isCancelled = true;
    };
  }, [
    activeAccount,
    activeAuth,
    connectionStatus,
    fetchMembershipsByUser,
    fetchServerWithChannels,
    reconcileServers,
  ]);

  const activeMemberships = activeAccount
    ? membershipsByUserRefKey[userRefKey(activeAccount)]
    : undefined;

  const hydratedServers = useMemo(() => {
    return (activeMemberships ?? [])
      .map(
        (membership) =>
          serverWithChannelsById[membership.server.id] ?? {
            server: membership.server,
            channels: [],
          }
      )
      .filter((value): value is ServerWithChannels => value !== undefined);
  }, [activeMemberships, serverWithChannelsById]);

  const hydratedServerById = useMemo(() => {
    return Object.fromEntries(
      hydratedServers.map((serverWithChannels) => [
        serverWithChannels.server.id,
        serverWithChannels,
      ])
    );
  }, [hydratedServers]);

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
      void fetchServerWithChannels(
        membership.server.id,
        getTargetHost(membership.server.host, activeAccount.host)
      ).finally(() => {
        pendingServerDetailsRef.current.delete(membership.server.id);
      });
    }
  }, [
    activeAccount,
    connectionStatus,
    fetchServerWithChannels,
    missingMembershipServers,
  ]);

  useEffect(() => {
    if (!activeAccount || connectionStatus !== "connected") {
      return;
    }
    const activeUserKey = userRefKey(activeAccount);
    if (activeUserKey in userByRefKey) {
      return;
    }
    void fetchUserByRef(activeAccount);
  }, [activeAccount, connectionStatus, fetchUserByRef, userByRefKey]);

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
  const selectedMembership = selectedServerId
    ? (activeMemberships?.find(
        (membership) => membership.server.id === selectedServerId
      ) ?? null)
    : null;
  const canDeleteSelectedServer =
    activeUser?.role === "admin" || selectedMembership?.role === "admin";
  const canModerateSelectedMessages = canDeleteSelectedServer;
  const isSelectedServerHydrating = selectedServer
    ? !(selectedServer.server.id in serverWithChannelsById) ||
      pendingServerDetailsRef.current.has(selectedServer.server.id)
    : false;
  const selectedChannel = selectedServer?.channels.find(
    (channel) => channel.id === selectedChannelId
  );
  const serverSettingsServer = serverSettingsServerId
    ? (hydratedServerById[serverSettingsServerId] ?? null)
    : null;
  const serverSettingsMembers = serverSettingsServerId
    ? (membersByServerId[serverSettingsServerId] ?? [])
    : [];
  const isServerSettingsOpen = !!serverSettingsServerId;
  const isLoadingServerSettingsMembers = serverSettingsServerId
    ? (isLoadingMembersByServerId[serverSettingsServerId] ?? false)
    : false;
  const serverSettingsMembersError =
    isServerSettingsOpen &&
    !isLoadingServerSettingsMembers &&
    !serverSettingsServer
      ? "Failed to load the selected server."
      : serverSettingsError;

  useEffect(() => {
    if (route.screen === "auth") {
      document.title = "Account | RuneLink";
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
      document.title = `${selectedServer.server.title}`;
      return;
    }

    document.title = `#${selectedChannel.title} | ${selectedServer.server.title}`;
  }, [
    isServerSettingsOpen,
    route.screen,
    selectedChannel,
    selectedServer,
    serverSettingsServer,
  ]);

  useEffect(() => {
    if (!serverSettingsServerId) {
      return;
    }

    const server = hydratedServerById[serverSettingsServerId] ?? null;
    if (!server) {
      return;
    }

    if (!activeAccount || connectionStatus !== "connected") {
      return;
    }

    if (hasFetchedMembersByServerId[serverSettingsServerId]) {
      setServerSettingsError(null);
      return;
    }

    setServerSettingsError(null);
    void fetchMembersByServer(
      serverSettingsServerId,
      getTargetHost(server.server.host, activeAccount.host)
    ).catch((error) => {
      setServerSettingsError(
        error instanceof Error ? error.message : "Failed to load server members"
      );
    });
  }, [
    activeAccount,
    connectionStatus,
    fetchMembersByServer,
    hydratedServerById,
    hasFetchedMembersByServerId,
    serverSettingsServerId,
  ]);

  const selectedChannelKey =
    selectedServerId && selectedChannelId
      ? serverChannelKey(selectedServerId, selectedChannelId)
      : null;
  const selectedMessages = selectedChannelKey
    ? (messagesByChannelKey[selectedChannelKey] ?? [])
    : [];
  const isMessagesLoading = selectedChannelKey
    ? (isLoadingByChannelKey[selectedChannelKey] ?? false)
    : false;
  const hasFetchedSelectedMessages = selectedChannelKey
    ? selectedChannelKey in messagesByChannelKey
    : false;
  const messagesError = selectedChannelKey
    ? (errorByChannelKey[selectedChannelKey] ?? null)
    : null;

  useEffect(() => {
    if (
      !selectedServerId ||
      !selectedChannelId ||
      hasFetchedSelectedMessages ||
      connectionStatus !== "connected" ||
      !selectedServer ||
      !activeAccount
    ) {
      return;
    }

    void fetchMessagesByChannel(
      selectedServerId,
      selectedChannelId,
      getTargetHost(selectedServer.server.host, activeAccount.host)
    );
  }, [
    activeAccount,
    connectionStatus,
    fetchMessagesByChannel,
    hasFetchedSelectedMessages,
    messagesByChannelKey,
    selectedChannelId,
    selectedServer,
    selectedServerId,
  ]);

  const connectedAccountKey = connectedAccount
    ? `${connectedAccount.name}@${connectedAccount.host}`
    : null;
  const switchedToReadyAccount =
    route.screen === "auth" &&
    !!manageOriginAccountKey &&
    !!activeAccount &&
    !!activeAuth &&
    activeAccountKey !== manageOriginAccountKey &&
    connectedAccountKey === activeAccountKey &&
    connectionStatus === "connected";

  useEffect(() => {
    if (!switchedToReadyAccount) {
      return;
    }
    setManageOriginAccountKey(null);
    setShouldPrefillAccount(true);
    const destination: AppRoute = authReturnRouteRef.current ?? {
      screen: "home",
    };
    authReturnRouteRef.current = null;
    navigate(destination, "push");
  }, [navigate, switchedToReadyAccount]);

  const shouldShowAuthScreen =
    route.screen === "auth" || !activeAccount || !activeAuth;
  const isChannelOpen = !!selectedServer && !!selectedChannel;

  function handleOpenAuth(prefillAccount: boolean) {
    cancelPendingAuthentication();
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
    setServerSettingsError(null);
    const channelId = selectedChannelIdByServerId[serverId] ?? null;
    navigate(getContentRoute(serverId, channelId), "push");
  }

  function handleSelectChannel(serverId: string, channel: Channel) {
    setServerSettingsError(null);
    navigate({ screen: "channel", serverId, channelId: channel.id }, "push");
  }

  function handleDeselectChannel() {
    if (!selectedServer) {
      return;
    }

    navigate({ screen: "server", serverId: selectedServer.server.id }, "push");
  }

  function handleOpenServerSettings(serverId: string) {
    setServerSettingsError(null);
    navigate({ screen: "server-settings", serverId }, "push");
  }

  function handleCloseServerSettings() {
    setServerSettingsError(null);
    backOrReplace(getContentRoute(selectedServerId, selectedChannelId));
  }

  function handleCloseAuthScreen() {
    authReturnRouteRef.current = null;
    setManageOriginAccountKey(null);
    setShouldPrefillAccount(true);
    backOrReplace(getContentRoute(selectedServerId, selectedChannelId));
  }

  async function handleSendMessage(body: string) {
    if (!activeAccount || !selectedServer || !selectedChannel) {
      return;
    }
    await createMessage(
      selectedServer.server.id,
      selectedChannel.id,
      {
        author: activeAccount,
        body,
      },
      getTargetHost(selectedServer.server.host, activeAccount.host)
    );
  }

  async function handleDeleteMessage(message: Message) {
    if (!activeAccount || !selectedServer || !selectedChannel) {
      return;
    }

    await deleteMessage(
      selectedServer.server.id,
      selectedChannel.id,
      message.id,
      getTargetHost(selectedServer.server.host, activeAccount.host)
    );
  }

  async function handleCreateChannel(title: string, description: string) {
    if (!activeAccount || !selectedServer) {
      return;
    }
    const channel = await createChannel(
      selectedServer.server.id,
      {
        title,
        description: description.trim() || null,
      },
      getTargetHost(selectedServer.server.host, activeAccount.host)
    );

    navigate(
      {
        screen: "channel",
        serverId: selectedServer.server.id,
        channelId: channel.id,
      },
      "push"
    );
  }

  async function handleDeleteChannel(channel: Channel) {
    if (!activeAccount || !selectedServer) {
      return;
    }
    await deleteChannel(
      selectedServer.server.id,
      channel.id,
      getTargetHost(selectedServer.server.host, activeAccount.host)
    );
  }

  async function handleCreateServer(
    host: string,
    title: string,
    description: string
  ) {
    if (!activeAccount) return;

    const server = await createServer(
      {
        title,
        description: description.trim() || null,
      },
      getTargetHost(host.trim(), activeAccount.host)
    );

    await fetchServerWithChannels(
      server.id,
      getTargetHost(host.trim(), activeAccount.host)
    );
    navigate({ screen: "server", serverId: server.id }, "push");
  }

  async function handleSearchServers(host: string) {
    if (!activeAccount) return [];
    return fetchServers(getTargetHost(host, activeAccount.host));
  }

  async function handleJoinServer(serverId: string, serverHost: string) {
    if (!activeAccount) return;

    debugRunelink("join server start", {
      serverId,
      serverHost,
      activeAccount,
    });

    await upsertMembership(serverId, {
      user_ref: activeAccount,
      server_id: serverId,
      server_host: serverHost,
      role: "member",
    });
    await fetchServerWithChannels(
      serverId,
      getTargetHost(serverHost, activeAccount.host)
    );
    debugRunelink("join server finished", {
      serverId,
      serverHost,
      activeAccount,
    });
    navigate({ screen: "server", serverId }, "push");
  }

  async function handleLeaveServer(serverId: string, serverHost: string) {
    if (!activeAccount) return;
    await deleteMembership(
      serverId,
      activeAccount,
      getTargetHost(serverHost, activeAccount.host)
    );
  }

  async function handleDeleteServer(serverId: string, serverHost: string) {
    if (!activeAccount) return;
    await deleteServer(serverId, getTargetHost(serverHost, activeAccount.host));
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <div
        className={[
          "min-w-0 shrink-0",
          shouldShowAuthScreen
            ? "flex w-auto"
            : isServerSettingsOpen
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
          isLoading={isSidebarLoading}
          error={sidebarError}
          isSelectedServerHydrating={isSelectedServerHydrating}
          activeHost={activeAccount?.host ?? null}
          accountRailOnly={shouldShowAuthScreen}
          onManageAccounts={() => handleOpenAuth(false)}
          onSelectAccount={() => handleOpenAuth(true)}
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
          onCreateChannel={handleCreateChannel}
          onDeleteChannel={handleDeleteChannel}
        />
      </div>

      <main
        className={[
          "min-h-0 min-w-0 overflow-hidden",
          shouldShowAuthScreen
            ? "flex flex-1"
            : isChannelOpen || isServerSettingsOpen
              ? "flex flex-1"
              : "hidden flex-1 sm:flex",
        ].join(" ")}
      >
        {shouldShowAuthScreen ? (
          <AuthScreen
            key={`${manageSessionId}:${activeAccount ? `${activeAccount.name}@${activeAccount.host}` : "no-account"}`}
            canClose={!!activeAccount && !!activeAuth}
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
        ) : isServerSettingsOpen ? (
          <ServerSettingsPage
            server={serverSettingsServer}
            members={serverSettingsMembers}
            isLoadingMembers={isLoadingServerSettingsMembers}
            membersError={serverSettingsMembersError}
            onDone={handleCloseServerSettings}
          />
        ) : (
          <MessagesPane
            selectedServer={selectedServer}
            selectedChannel={selectedChannel}
            selectedChannelKey={selectedChannelKey}
            selectedMessages={selectedMessages}
            isSidebarLoading={isSidebarLoading}
            sidebarError={sidebarError}
            hydratedServerCount={hydratedServers.length}
            isMessagesLoading={isMessagesLoading}
            messagesError={messagesError}
            activeAccount={activeAccount}
            canModerateMessages={canModerateSelectedMessages}
            canDeleteChannel={canDeleteSelectedServer}
            onDeselectChannel={handleDeselectChannel}
            onSendMessage={handleSendMessage}
            onDeleteChannel={handleDeleteChannel}
            onDeleteMessage={handleDeleteMessage}
          />
        )}
      </main>
    </div>
  );
}

export default App;
