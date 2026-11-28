import { ResourceRefSchema } from "@runelink/sdk";
import type { ResourceRef } from "@runelink/sdk";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

const decodeId = Schema.decodeUnknownOption(ResourceRefSchema.fields.id);
const decodeRef = Schema.decodeUnknownOption(ResourceRefSchema);

// Channels and messages are on the server's host.
export type AppRoute =
  | { screen: "home" }
  | { screen: "auth" }
  | { screen: "server"; server: ResourceRef }
  | {
      screen: "channel";
      server: ResourceRef;
      channelId: string;
      messageId?: string;
    }
  | { screen: "channel-settings"; server: ResourceRef; channelId: string }
  | { screen: "channel-members"; server: ResourceRef; channelId: string }
  | { screen: "server-settings"; server: ResourceRef };

export function getContentRoute(
  server: ResourceRef | null,
  channelId: string | null
): AppRoute {
  if (server == null) return { screen: "home" };
  if (channelId == null || channelId === "") {
    return { screen: "server", server };
  }
  return { screen: "channel", server, channelId };
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

// Path segments are never empty, so neither is the host.
function parseServer(host: string, id: string): ResourceRef | null {
  return Option.all({
    host: decodePathSegment(host),
    id: decodePathSegment(id),
  }).pipe(Option.flatMap(decodeRef), Option.getOrNull);
}

function serverPath(server: ResourceRef): string {
  return `/servers/${encodeURIComponent(server.host)}/${server.id}`;
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
    /^\/servers\/([^/]+)\/([^/]+)\/channels\/([^/]+)(\/(?:members|settings))?\/?$/u.exec(
      pathname
    );
  if (channelMatch) {
    const server = parseServer(channelMatch[1] ?? "", channelMatch[2] ?? "");
    const channelId = parseId(channelMatch[3] ?? "");
    const screen = getChannelScreen(channelMatch[4]);
    if (server === null || channelId === null) return null;
    const messageId = decodeId(new URLSearchParams(search).get("message"));
    return screen === "channel" && Option.isSome(messageId)
      ? { screen, server, channelId, messageId: messageId.value }
      : { screen, server, channelId };
  }

  const settingsMatch = /^\/servers\/([^/]+)\/([^/]+)\/settings\/?$/u.exec(
    pathname
  );
  if (settingsMatch) {
    const server = parseServer(settingsMatch[1] ?? "", settingsMatch[2] ?? "");
    return server === null ? null : { screen: "server-settings", server };
  }

  const serverMatch = /^\/servers\/([^/]+)\/([^/]+)\/?$/u.exec(pathname);
  if (serverMatch) {
    const server = parseServer(serverMatch[1] ?? "", serverMatch[2] ?? "");
    return server === null ? null : { screen: "server", server };
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
      return serverPath(route.server);
    }
    case "channel": {
      const targetMessageId = messageId ?? route.messageId;
      return `${serverPath(route.server)}/channels/${route.channelId}${
        targetMessageId != null && targetMessageId !== ""
          ? `?${new URLSearchParams({ message: targetMessageId })}`
          : ""
      }`;
    }
    case "channel-settings": {
      return `${serverPath(route.server)}/channels/${route.channelId}/settings`;
    }
    case "channel-members": {
      return `${serverPath(route.server)}/channels/${route.channelId}/members`;
    }
    case "server-settings": {
      return `${serverPath(route.server)}/settings`;
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
