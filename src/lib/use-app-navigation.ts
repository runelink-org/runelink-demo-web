import { resourceKey } from "@runelink/sdk";
import type {
  ResourceKey,
  ResourceRef,
  ServerWithChannels,
} from "@runelink/sdk";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  getAppRoutePath,
  getContentRoute,
  isAppHistoryEntry,
  parseAppRoute,
  writeAppRoute,
} from "@/lib/app-route";
import type { AppRoute } from "@/lib/app-route";
import { firstTextChannel } from "@/lib/channel-tree";
import { getState } from "@/lib/atom-registry";
import { sameResource } from "@/lib/runelink-store-utils";
import {
  navigationAtom,
  selectChannel,
  selectServer,
} from "@/lib/navigation-store";

type NavigationSelection = {
  server: ResourceRef | null;
  channelId: string | null;
};

// The selected server, or another one if it is gone, with its saved channel.
// A channel ID only means something on its own server.
export function getFallbackSelection(
  servers: readonly ServerWithChannels[],
  selectedServer: ResourceRef | null,
  savedChannelIds: Record<ResourceKey, string | null>
): NavigationSelection {
  // Fall back to a server whose channels loaded, rather than one on an
  // unreachable host
  const nextServer =
    servers.find(({ server }) => sameResource(server, selectedServer)) ??
    servers.find((server) => server.channels.length > 0) ??
    servers[0];
  if (nextServer == null) return { server: null, channelId: null };

  const server = { host: nextServer.server.host, id: nextServer.server.id };
  const channelId = savedChannelIds[resourceKey(server)] ?? null;
  if (channelId == null || channelId === "") {
    return { server, channelId: null };
  }

  const selectedChannel = nextServer.channels.find(
    (channel) => channel.id === channelId && channel.kind === "text"
  );
  const nextChannel = selectedChannel ?? firstTextChannel(nextServer.channels);
  return { server, channelId: nextChannel?.id ?? null };
}

export function useAppNavigation() {
  const [initialLocation] = useState(() => {
    const parsedRoute = parseAppRoute(
      window.location.pathname,
      window.location.search
    );
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
        mode === "push" &&
        nextPath === window.location.pathname + window.location.search
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
    (servers: readonly ServerWithChannels[]) => {
      const navigationState = getState(navigationAtom);
      const selected = navigationState.selectedServer;
      const savedChannelIds = navigationState.selectedChannelIdByServerKey;
      const nextSelection = getFallbackSelection(
        servers,
        selected,
        savedChannelIds
      );

      if (!sameResource(nextSelection.server, selected)) {
        selectServer(nextSelection.server);
      }
      if (
        nextSelection.server != null &&
        (navigationState.selectedChannelIdByServerKey[
          resourceKey(nextSelection.server)
        ] ?? null) !== nextSelection.channelId
      ) {
        selectChannel(nextSelection.server, nextSelection.channelId);
      }

      const currentRoute = routeRef.current;
      const isValidChannelRoute =
        currentRoute.screen === "channel" &&
        sameResource(currentRoute.server, nextSelection.server) &&
        currentRoute.channelId === nextSelection.channelId;
      const isValidSettingsRoute =
        (currentRoute.screen === "server-settings" &&
          servers.some(({ server }) =>
            sameResource(server, currentRoute.server)
          )) ||
        (currentRoute.screen === "channel-settings" &&
          servers.some(
            ({ server, channels }) =>
              sameResource(server, currentRoute.server) &&
              channels.some((channel) => channel.id === currentRoute.channelId)
          ));
      const isValidMembersRoute =
        currentRoute.screen === "channel-members" &&
        sameResource(currentRoute.server, nextSelection.server) &&
        currentRoute.channelId === nextSelection.channelId;
      if (
        currentRoute.screen !== "auth" &&
        !isValidChannelRoute &&
        !isValidSettingsRoute &&
        !isValidMembersRoute
      ) {
        navigate(
          getContentRoute(nextSelection.server, nextSelection.channelId),
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
      const parsedRoute = parseAppRoute(
        window.location.pathname,
        window.location.search
      );
      const nextRoute: AppRoute = parsedRoute ?? { screen: "home" };
      if (!parsedRoute) {
        writeAppRoute(nextRoute, "replace");
      }
      routeRef.current = nextRoute;
      setRoute(nextRoute);
    }

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [initialLocation.pathWasValid]);

  useLayoutEffect(() => {
    switch (route.screen) {
      case "home": {
        selectServer(null);
        break;
      }
      case "server": {
        selectChannel(route.server, null);
        break;
      }
      case "channel":
      case "channel-members": {
        selectChannel(route.server, route.channelId);
        break;
      }
      case "channel-settings":
      case "server-settings": {
        selectServer(route.server);
        break;
      }
      case "auth": {
        break;
      }
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
