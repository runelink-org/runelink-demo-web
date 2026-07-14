import { z } from "zod";

const IdSchema = z.uuid();

export type AppRoute =
  | { screen: "home" }
  | { screen: "auth" }
  | { screen: "server"; serverId: string }
  | { screen: "channel"; serverId: string; channelId: string }
  | { screen: "server-settings"; serverId: string };

export function getContentRoute(
  serverId: string | null,
  channelId: string | null
): AppRoute {
  if (!serverId) {
    return { screen: "home" };
  }
  if (!channelId) {
    return { screen: "server", serverId };
  }
  return { screen: "channel", serverId, channelId };
}

const AppHistoryStateSchema = z.object({
  runelinkNavigation: z.literal(true),
});

function parseId(value: string): string | null {
  try {
    const result = IdSchema.safeParse(decodeURIComponent(value));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function parseAppRoute(pathname: string): AppRoute | null {
  if (pathname === "/" || pathname === "") {
    return { screen: "home" };
  }

  if (pathname === "/auth" || pathname === "/auth/") {
    return { screen: "auth" };
  }

  const channelMatch = pathname.match(
    /^\/servers\/([^/]+)\/channels\/([^/]+)\/?$/
  );
  if (channelMatch) {
    const serverId = parseId(channelMatch[1] ?? "");
    const channelId = parseId(channelMatch[2] ?? "");
    return serverId && channelId
      ? { screen: "channel", serverId, channelId }
      : null;
  }

  const settingsMatch = pathname.match(/^\/servers\/([^/]+)\/settings\/?$/);
  if (settingsMatch) {
    const serverId = parseId(settingsMatch[1] ?? "");
    return serverId ? { screen: "server-settings", serverId } : null;
  }

  const serverMatch = pathname.match(/^\/servers\/([^/]+)\/?$/);
  if (serverMatch) {
    const serverId = parseId(serverMatch[1] ?? "");
    return serverId ? { screen: "server", serverId } : null;
  }

  return null;
}

export function getAppRoutePath(route: AppRoute): string {
  switch (route.screen) {
    case "home":
      return "/";
    case "auth":
      return "/auth";
    case "server":
      return `/servers/${route.serverId}`;
    case "channel":
      return `/servers/${route.serverId}/channels/${route.channelId}`;
    case "server-settings":
      return `/servers/${route.serverId}/settings`;
  }
}

export function isAppHistoryEntry(value: unknown): boolean {
  return AppHistoryStateSchema.safeParse(value).success;
}

export function writeAppRoute(route: AppRoute, mode: "push" | "replace"): void {
  const path = getAppRoutePath(route);
  if (mode === "push") {
    window.history.pushState({ runelinkNavigation: true }, "", path);
    return;
  }

  const state = isAppHistoryEntry(window.history.state)
    ? window.history.state
    : null;
  window.history.replaceState(state, "", path);
}
