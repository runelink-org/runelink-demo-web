import { resourceKey } from "@runelink/sdk";
import type {
  ResourceKey,
  ServerChannelId,
  ServerId,
  ServerRef,
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
  serverRef: ServerRef | null;
  channelId: ServerChannelId | null;
};

// The selected server, or another one if it is gone, with its saved channel.
// Saved channel IDs are per server, and are on the host of their server.
export function getFallbackSelection(
  servers: readonly ServerWithChannels[],
  selectedServerRef: ServerRef | null,
  savedChannelIds: Record<ResourceKey<ServerId>, ServerChannelId | null>
): NavigationSelection {
  // Fall back to a server whose channels loaded, rather than one on an
  // unreachable host
  const nextServer =
    servers.find(({ server }) => sameResource(server, selectedServerRef)) ??
    servers.find((server) => server.channels.length > 0) ??
    servers[0];
  if (nextServer == null) return { serverRef: null, channelId: null };

  const serverRef = { host: nextServer.server.host, id: nextServer.server.id };
  const channelId = savedChannelIds[resourceKey(serverRef)] ?? null;
  if (channelId == null) {
    return { serverRef, channelId: null };
  }

  const selectedChannel = nextServer.channels.find(
    (channel) => channel.id === channelId && channel.kind === "text"
  );
  const nextChannel = selectedChannel ?? firstTextChannel(nextServer.channels);
  return { serverRef, channelId: nextChannel?.id ?? null };
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
      const { selectedServerRef } = navigationState;
      const savedChannelIds = navigationState.selectedChannelIdByServerKey;
      const nextSelection = getFallbackSelection(
        servers,
        selectedServerRef,
        savedChannelIds
      );

      if (!sameResource(nextSelection.serverRef, selectedServerRef)) {
        selectServer(nextSelection.serverRef);
      }
      if (
        nextSelection.serverRef != null &&
        (navigationState.selectedChannelIdByServerKey[
          resourceKey(nextSelection.serverRef)
        ] ?? null) !== nextSelection.channelId
      ) {
        selectChannel(nextSelection.serverRef, nextSelection.channelId);
      }

      const currentRoute = routeRef.current;
      const isValidChannelRoute =
        currentRoute.screen === "channel" &&
        sameResource(currentRoute.serverRef, nextSelection.serverRef) &&
        currentRoute.channelId === nextSelection.channelId;
      const isValidSettingsRoute =
        (currentRoute.screen === "server-settings" &&
          servers.some(({ server }) =>
            sameResource(server, currentRoute.serverRef)
          )) ||
        (currentRoute.screen === "channel-settings" &&
          servers.some(
            ({ server, channels }) =>
              sameResource(server, currentRoute.serverRef) &&
              channels.some((channel) => channel.id === currentRoute.channelId)
          ));
      const isValidMembersRoute =
        currentRoute.screen === "channel-members" &&
        sameResource(currentRoute.serverRef, nextSelection.serverRef) &&
        currentRoute.channelId === nextSelection.channelId;
      if (
        currentRoute.screen !== "auth" &&
        !isValidChannelRoute &&
        !isValidSettingsRoute &&
        !isValidMembersRoute
      ) {
        navigate(
          getContentRoute(nextSelection.serverRef, nextSelection.channelId),
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
        selectChannel(route.serverRef, null);
        break;
      }
      case "channel":
      case "channel-members": {
        selectChannel(route.serverRef, route.channelId);
        break;
      }
      case "channel-settings":
      case "server-settings": {
        selectServer(route.serverRef);
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
