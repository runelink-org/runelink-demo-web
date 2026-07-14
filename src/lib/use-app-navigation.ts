import type { ServerWithChannels } from "@runelink/sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AppRoute,
  getAppRoutePath,
  getContentRoute,
  isAppHistoryEntry,
  parseAppRoute,
  writeAppRoute,
} from "@/lib/app-route";
import { useNavigationStore } from "@/lib/navigation-store";

type NavigationSelection = {
  serverId: string | null;
  channelId: string | null;
};

function getFallbackSelection(
  servers: ServerWithChannels[],
  currentSelection: NavigationSelection
): NavigationSelection {
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
    return { serverId: nextServer.server.id, channelId: null };
  }

  const selectedChannel = nextServer.channels.find(
    (channel) => channel.id === currentSelection.channelId
  );
  const nextChannel = selectedChannel ?? nextServer.channels[0] ?? null;

  return {
    serverId: nextServer.server.id,
    channelId: nextChannel?.id ?? null,
  };
}

export function useAppNavigation() {
  const [initialLocation] = useState(() => {
    const parsedRoute = parseAppRoute(window.location.pathname);
    const initialRoute: AppRoute = parsedRoute ?? { screen: "home" };
    return {
      route: initialRoute,
      pathWasValid: parsedRoute !== null,
    };
  });
  const [route, setRoute] = useState<AppRoute>(initialLocation.route);
  const routeRef = useRef(route);

  const navigate = useCallback(
    (nextRoute: AppRoute, mode: "push" | "replace") => {
      const nextPath = getAppRoutePath(nextRoute);
      const nextMode =
        mode === "push" && nextPath === window.location.pathname
          ? "replace"
          : mode;
      writeAppRoute(nextRoute, nextMode);
      routeRef.current = nextRoute;
      setRoute(nextRoute);
    },
    []
  );

  const getCurrentRoute = useCallback(() => routeRef.current, []);

  const backOrReplace = useCallback(
    (fallbackRoute: AppRoute) => {
      if (isAppHistoryEntry(window.history.state)) {
        window.history.back();
        return;
      }
      navigate(fallbackRoute, "replace");
    },
    [navigate]
  );

  const reconcileServers = useCallback(
    (servers: ServerWithChannels[]) => {
      const navigationState = useNavigationStore.getState();
      const nextSelection = getFallbackSelection(servers, {
        serverId: navigationState.selectedServerId,
        channelId: navigationState.selectedServerId
          ? (navigationState.selectedChannelIdByServerId[
              navigationState.selectedServerId
            ] ?? null)
          : null,
      });

      if (nextSelection.serverId !== navigationState.selectedServerId) {
        navigationState.selectServer(nextSelection.serverId);
      }
      if (
        nextSelection.serverId &&
        (navigationState.selectedChannelIdByServerId[nextSelection.serverId] ??
          null) !== nextSelection.channelId
      ) {
        navigationState.selectChannel(
          nextSelection.serverId,
          nextSelection.channelId
        );
      }

      const currentRoute = routeRef.current;
      const isValidSettingsRoute =
        currentRoute.screen === "server-settings" &&
        servers.some((server) => server.server.id === currentRoute.serverId);
      if (currentRoute.screen !== "auth" && !isValidSettingsRoute) {
        navigate(
          getContentRoute(nextSelection.serverId, nextSelection.channelId),
          "replace"
        );
      }
    },
    [navigate]
  );

  useEffect(() => {
    if (!initialLocation.pathWasValid) {
      writeAppRoute({ screen: "home" }, "replace");
    }

    function handlePopState() {
      const parsedRoute = parseAppRoute(window.location.pathname);
      const nextRoute: AppRoute = parsedRoute ?? { screen: "home" };
      if (!parsedRoute) {
        writeAppRoute(nextRoute, "replace");
      }
      routeRef.current = nextRoute;
      setRoute(nextRoute);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [initialLocation.pathWasValid]);

  useEffect(() => {
    const navigationState = useNavigationStore.getState();
    switch (route.screen) {
      case "home":
        navigationState.selectServer(null);
        break;
      case "server":
        navigationState.selectChannel(route.serverId, null);
        break;
      case "channel":
        navigationState.selectChannel(route.serverId, route.channelId);
        break;
      case "server-settings":
        navigationState.selectServer(route.serverId);
        break;
      case "auth":
        break;
    }
  }, [route]);

  return {
    route,
    navigate,
    getCurrentRoute,
    backOrReplace,
    reconcileServers,
  };
}
