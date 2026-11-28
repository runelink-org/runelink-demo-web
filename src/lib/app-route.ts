import {
  MessageIdSchema,
  ServerChannelIdSchema,
  ServerRefSchema,
} from "@runelink/sdk";
import type { MessageId, ServerChannelId, ServerRef } from "@runelink/sdk";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

const decodeServerRef = Schema.decodeUnknownOption(ServerRefSchema);
const decodeChannelId = Schema.decodeUnknownOption(ServerChannelIdSchema);
const decodeMessageId = Schema.decodeUnknownOption(MessageIdSchema);

// Channels and messages are on the server's host.
export type AppRoute =
  | { screen: "home" }
  | { screen: "auth" }
  | { screen: "server"; serverRef: ServerRef }
  | {
      screen: "channel";
      serverRef: ServerRef;
      channelId: ServerChannelId;
      messageId?: MessageId;
    }
  | {
      screen: "channel-settings";
      serverRef: ServerRef;
      channelId: ServerChannelId;
    }
  | {
      screen: "channel-members";
      serverRef: ServerRef;
      channelId: ServerChannelId;
    }
  | { screen: "server-settings"; serverRef: ServerRef };

export function getContentRoute(
  serverRef: ServerRef | null,
  channelId: ServerChannelId | null
): AppRoute {
  if (serverRef == null) return { screen: "home" };
  if (channelId == null) {
    return { screen: "server", serverRef };
  }
  return { screen: "channel", serverRef, channelId };
}

const isAppHistoryState = Schema.is(
  Schema.Struct({ runelinkNavigation: Schema.Literal(true) })
);

const decodePathSegment = Option.liftThrowable(decodeURIComponent);

function parseChannelId(value: string): ServerChannelId | null {
  return decodePathSegment(value).pipe(
    Option.flatMap(decodeChannelId),
    Option.getOrNull
  );
}

// Path segments are never empty, so neither is the host.
function parseServerRef(host: string, id: string): ServerRef | null {
  return Option.all({
    host: decodePathSegment(host),
    id: decodePathSegment(id),
  }).pipe(Option.flatMap(decodeServerRef), Option.getOrNull);
}

function serverPath(serverRef: ServerRef): string {
  return `/servers/${encodeURIComponent(serverRef.host)}/${serverRef.id}`;
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
    const serverRef = parseServerRef(
      channelMatch[1] ?? "",
      channelMatch[2] ?? ""
    );
    const channelId = parseChannelId(channelMatch[3] ?? "");
    const screen = getChannelScreen(channelMatch[4]);
    if (serverRef === null || channelId === null) return null;
    const messageId = decodeMessageId(
      new URLSearchParams(search).get("message")
    );
    return screen === "channel" && Option.isSome(messageId)
      ? { screen, serverRef, channelId, messageId: messageId.value }
      : { screen, serverRef, channelId };
  }

  const settingsMatch = /^\/servers\/([^/]+)\/([^/]+)\/settings\/?$/u.exec(
    pathname
  );
  if (settingsMatch) {
    const serverRef = parseServerRef(
      settingsMatch[1] ?? "",
      settingsMatch[2] ?? ""
    );
    return serverRef === null ? null : { screen: "server-settings", serverRef };
  }

  const serverMatch = /^\/servers\/([^/]+)\/([^/]+)\/?$/u.exec(pathname);
  if (serverMatch) {
    const serverRef = parseServerRef(
      serverMatch[1] ?? "",
      serverMatch[2] ?? ""
    );
    return serverRef === null ? null : { screen: "server", serverRef };
  }

  return null;
}

export function getAppRoutePath(
  route: AppRoute,
  messageId?: MessageId
): string {
  switch (route.screen) {
    case "home": {
      return "/";
    }
    case "auth": {
      return "/auth";
    }
    case "server": {
      return serverPath(route.serverRef);
    }
    case "channel": {
      const targetMessageId = messageId ?? route.messageId;
      return `${serverPath(route.serverRef)}/channels/${route.channelId}${
        targetMessageId != null && targetMessageId !== ""
          ? `?${new URLSearchParams({ message: targetMessageId })}`
          : ""
      }`;
    }
    case "channel-settings": {
      return `${serverPath(route.serverRef)}/channels/${route.channelId}/settings`;
    }
    case "channel-members": {
      return `${serverPath(route.serverRef)}/channels/${route.channelId}/members`;
    }
    case "server-settings": {
      return `${serverPath(route.serverRef)}/settings`;
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
