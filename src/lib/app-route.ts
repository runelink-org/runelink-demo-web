import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

const decodeId = Schema.decodeUnknownOption(
  Schema.String.check(Schema.isUUID())
);

export type AppRoute =
  | { screen: "home" }
  | { screen: "auth" }
  | { screen: "server"; serverId: string }
  | {
      screen: "channel";
      serverId: string;
      channelId: string;
      messageId?: string;
    }
  | { screen: "channel-settings"; serverId: string; channelId: string }
  | { screen: "channel-members"; serverId: string; channelId: string }
  | { screen: "server-settings"; serverId: string };

export function getContentRoute(
  serverId: string | null,
  channelId: string | null
): AppRoute {
  if (serverId == null || serverId === "") return { screen: "home" };
  if (channelId == null || channelId === "") {
    return { screen: "server", serverId };
  }
  return { screen: "channel", serverId, channelId };
}

const isAppHistoryState = Schema.is(
  Schema.Struct({ runelinkNavigation: Schema.Literal(true) })
);

const decodePathSegment = Option.liftThrowable(decodeURIComponent);

function parseId(value: string): string | null {
  return decodePathSegment(value).pipe(
    Option.flatMap(decodeId),
    Option.getOrNull
  );
}

function getChannelScreen(suffix: string | undefined) {
  if (suffix === "/settings") return "channel-settings";
  if (suffix === "/members") return "channel-members";
  return "channel";
}

export function parseAppRoute(pathname: string, search = ""): AppRoute | null {
  if (pathname === "/" || pathname === "") {
    return { screen: "home" };
  }

  if (pathname === "/auth" || pathname === "/auth/") {
    return { screen: "auth" };
  }

  const channelMatch =
    /^\/servers\/([^/]+)\/channels\/([^/]+)(\/(?:members|settings))?\/?$/u.exec(
      pathname
    );
  if (channelMatch) {
    const serverId = parseId(channelMatch[1] ?? "");
    const channelId = parseId(channelMatch[2] ?? "");
    const screen = getChannelScreen(channelMatch[3]);
    if (serverId === null || channelId === null) return null;
    const messageId = decodeId(new URLSearchParams(search).get("message"));
    return screen === "channel" && Option.isSome(messageId)
      ? { screen, serverId, channelId, messageId: messageId.value }
      : { screen, serverId, channelId };
  }

  const settingsMatch = /^\/servers\/([^/]+)\/settings\/?$/u.exec(pathname);
  if (settingsMatch) {
    const serverId = parseId(settingsMatch[1] ?? "");
    return serverId === null ? null : { screen: "server-settings", serverId };
  }

  const serverMatch = /^\/servers\/([^/]+)\/?$/u.exec(pathname);
  if (serverMatch) {
    const serverId = parseId(serverMatch[1] ?? "");
    return serverId === null ? null : { screen: "server", serverId };
  }

  return null;
}

export function getAppRoutePath(route: AppRoute, messageId?: string): string {
  switch (route.screen) {
    case "home": {
      return "/";
    }
    case "auth": {
      return "/auth";
    }
    case "server": {
      return `/servers/${route.serverId}`;
    }
    case "channel": {
      const targetMessageId = messageId ?? route.messageId;
      return `/servers/${route.serverId}/channels/${route.channelId}${
        targetMessageId != null && targetMessageId !== ""
          ? `?${new URLSearchParams({ message: targetMessageId })}`
          : ""
      }`;
    }
    case "channel-settings": {
      return `/servers/${route.serverId}/channels/${route.channelId}/settings`;
    }
    case "channel-members": {
      return `/servers/${route.serverId}/channels/${route.channelId}/members`;
    }
    case "server-settings": {
      return `/servers/${route.serverId}/settings`;
    }
  }
}

export function isAppHistoryEntry(value: unknown): boolean {
  return isAppHistoryState(value);
}

export function writeAppRoute(route: AppRoute, mode: "push" | "replace"): void {
  const path = getAppRoutePath(route);
  if (mode === "push") {
    window.history.pushState({ runelinkNavigation: true }, "", path);
    return;
  }

  const state: unknown = window.history.state;
  window.history.replaceState(
    isAppHistoryEntry(state) ? state : null,
    "",
    path
  );
}
