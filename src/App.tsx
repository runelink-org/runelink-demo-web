import type { Channel, Message, ServerWithChannels } from "@runelink/sdk";
import { useEffect, useMemo, useRef, useState } from "react";
import { AuthScreen } from "@/components/AuthScreen";
import { MessagesPane } from "@/components/MessagesPane";
import { Sidebar } from "@/components/Sidebar";
import {
  getActiveAccount,
  getActiveAccountAuth,
  useAuthStore,
} from "@/lib/auth-store";
import { useChannelsStore } from "@/lib/channels-store";
import { useNavigationStore } from "@/lib/navigation-store";
import {
  initializeRunelinkConnectionStore,
  useRunelinkConnectionStore,
} from "@/lib/runelink-connection-store";
import { useMembershipsStore } from "@/lib/memberships-store";
import { useMessagesStore } from "@/lib/messages-store";
import { debugRunelink } from "@/lib/runelink-debug";
import { serverChannelKey, userRefKey } from "@/lib/runelink-store-utils";
import { useServersStore } from "@/lib/servers-store";
import { useUsersStore } from "@/lib/users-store";

function getFallbackSelection(
  servers: ServerWithChannels[],
  currentSelection: { serverId: string | null; channelId: string | null }
): { serverId: string | null; channelId: string | null } {
  if (servers.length === 0) {
    return { serverId: null, channelId: null };
  }

  const selectedServer = currentSelection.serverId
    ? servers.find((server) => server.server.id === currentSelection.serverId)
    : null;
  const nextServer = selectedServer ?? servers[0];

  if (!nextServer) {
    return { serverId: null, channelId: null };
  }

  if (!currentSelection.channelId) {
    return {
      serverId: nextServer.server.id,
      channelId: null,
    };
  }

  const selectedChannel = currentSelection.channelId
    ? nextServer.channels.find(
        (channel) => channel.id === currentSelection.channelId
      )
    : null;
  const nextChannel = selectedChannel ?? nextServer.channels[0] ?? null;

  return {
    serverId: nextServer.server.id,
    channelId: nextChannel?.id ?? null,
  };
}

function getTargetHost(serverHost: string, activeHost: string): string | null {
  return serverHost === activeHost ? null : serverHost;
}

export function App() {
  const pendingServerDetailsRef = useRef<Set<string>>(new Set());
  const [isManagingAccounts, setIsManagingAccounts] = useState(false);
  const [manageSessionId, setManageSessionId] = useState(0);
  const [shouldPrefillAccount, setShouldPrefillAccount] = useState(true);
  const [manageOriginAccountKey, setManageOriginAccountKey] = useState<
    string | null
  >(null);
  const [isSidebarLoading, setIsSidebarLoading] = useState(false);
  const [sidebarError, setSidebarError] = useState<string | null>(null);

  const activeAccount = useAuthStore(getActiveAccount);
  const activeAuth = useAuthStore(getActiveAccountAuth);
  const selectedServerId = useNavigationStore(
    (state) => state.selectedServerId
  );
  const selectedChannelIdByServerId = useNavigationStore(
    (state) => state.selectedChannelIdByServerId
  );
  const selectServer = useNavigationStore((state) => state.selectServer);
  const selectChannel = useNavigationStore((state) => state.selectChannel);
  const connectionStatus = useRunelinkConnectionStore((state) => state.status);
  const membershipsByUserRefKey = useMembershipsStore(
    (state) => state.membershipsByUserRefKey
  );
  const fetchMembershipsByUser = useMembershipsStore(
    (state) => state.fetchMembershipsByUser
  );
  const createMembership = useMembershipsStore(
    (state) => state.createMembership
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

  useEffect(() => {
    initializeRunelinkConnectionStore();
  }, []);

  useEffect(() => {
    if (!activeAccount || !activeAuth) {
      setIsSidebarLoading(false);
      setSidebarError(null);
    }
  }, [activeAccount, activeAuth]);

  useEffect(() => {
    if (!activeAccount || !activeAuth || connectionStatus !== "connected") {
      return;
    }

    const account = activeAccount;
    let isCancelled = false;

    async function loadSidebar() {
      setIsSidebarLoading(true);
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

        const navigationState = useNavigationStore.getState();
        const nextSelection = getFallbackSelection(fullServers, {
          serverId: navigationState.selectedServerId,
          channelId: navigationState.selectedServerId
            ? (navigationState.selectedChannelIdByServerId[
                navigationState.selectedServerId
              ] ?? null)
            : null,
        });

        if (nextSelection.serverId !== navigationState.selectedServerId) {
          selectServer(nextSelection.serverId);
        }
        if (
          nextSelection.serverId &&
          (navigationState.selectedChannelIdByServerId[
            nextSelection.serverId
          ] ?? null) !== nextSelection.channelId
        ) {
          selectChannel(nextSelection.serverId, nextSelection.channelId);
        }
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setSidebarError(
          error instanceof Error ? error.message : "Failed to load servers"
        );
        selectServer(null);
      } finally {
        if (!isCancelled) {
          setIsSidebarLoading(false);
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
    selectChannel,
    selectServer,
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
    if (isSidebarLoading) {
      return;
    }

    debugRunelink("hydrate sidebar servers", {
      selectedServerId,
      hydratedServerIds: hydratedServers.map((server) => server.server.id),
    });

    const nextSelection = getFallbackSelection(hydratedServers, {
      serverId: selectedServerId,
      channelId: selectedServerId
        ? (selectedChannelIdByServerId[selectedServerId] ?? null)
        : null,
    });

    if (nextSelection.serverId !== selectedServerId) {
      selectServer(nextSelection.serverId);
    }
    if (
      nextSelection.serverId &&
      (selectedChannelIdByServerId[nextSelection.serverId] ?? null) !==
        nextSelection.channelId
    ) {
      selectChannel(nextSelection.serverId, nextSelection.channelId);
    }
  }, [
    hydratedServers,
    isSidebarLoading,
    selectChannel,
    selectServer,
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

  const switchedToReadyAccount =
    isManagingAccounts &&
    !!activeAccount &&
    !!activeAuth &&
    activeAccountKey !== manageOriginAccountKey;

  const shouldShowAuthScreen = useMemo(() => {
    return (
      (isManagingAccounts && !switchedToReadyAccount) ||
      !activeAccount ||
      !activeAuth
    );
  }, [activeAccount, activeAuth, isManagingAccounts, switchedToReadyAccount]);

  function handleSelectServer(serverId: string) {
    selectServer(serverId);
  }

  function handleSelectChannel(serverId: string, channel: Channel) {
    selectChannel(serverId, channel.id);
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

    selectChannel(selectedServer.server.id, channel.id);
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
    selectServer(server.id);
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

    await createMembership(serverId, {
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
    selectServer(serverId);
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
    <div className="flex h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_color-mix(in_oklab,var(--color-primary)_8%,transparent),transparent_32%),linear-gradient(180deg,color-mix(in_oklab,var(--color-muted)_60%,white),transparent_28%)]">
      <Sidebar
        servers={hydratedServers}
        selectedServerId={selectedServerId}
        selectedChannelId={selectedChannelId}
        selectedChannelIdByServerId={selectedChannelIdByServerId}
        isLoading={isSidebarLoading}
        error={sidebarError}
        isSelectedServerHydrating={isSelectedServerHydrating}
        activeHost={activeAccount?.host ?? null}
        onManageAccounts={() => {
          setManageOriginAccountKey(activeAccountKey);
          setShouldPrefillAccount(false);
          setManageSessionId((value) => value + 1);
          setIsManagingAccounts(true);
        }}
        onSelectAccount={() => {
          setShouldPrefillAccount(true);
          setManageSessionId((value) => value + 1);
          setIsManagingAccounts(true);
        }}
        onSelectServer={handleSelectServer}
        onSelectChannel={handleSelectChannel}
        onCreateServer={handleCreateServer}
        onSearchServers={handleSearchServers}
        onJoinServer={handleJoinServer}
        onLeaveServer={handleLeaveServer}
        onDeleteServer={handleDeleteServer}
        canDeleteSelectedServer={canDeleteSelectedServer}
        onCreateChannel={handleCreateChannel}
        onDeleteChannel={handleDeleteChannel}
      />

      <main className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {shouldShowAuthScreen ? (
          <AuthScreen
            key={`${manageSessionId}:${activeAccount ? `${activeAccount.name}@${activeAccount.host}` : "no-account"}`}
            canClose={!!activeAccount && !!activeAuth}
            prefillAccount={shouldPrefillAccount}
            onDone={() => {
              setIsManagingAccounts(false);
              setManageOriginAccountKey(null);
              setShouldPrefillAccount(true);
            }}
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
            onSendMessage={handleSendMessage}
            onDeleteMessage={handleDeleteMessage}
          />
        )}
      </main>
    </div>
  );
}

export default App;
