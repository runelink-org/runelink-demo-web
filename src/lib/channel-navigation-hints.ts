import type { Message, ServerWithChannels, UserRef } from "@runelink/sdk";
import { z } from "zod";
import { accountStorageKey } from "@/lib/account-storage";
import type { AppRoute } from "@/lib/app-route";
import { mergeMessages } from "@/lib/message-cache";
import { requestExpected } from "@/lib/runelink-request";

const STORAGE_KEY = "runelink.demo.channel-navigation-hints";
const ServerHintsSchema = z.object({
  host: z.string().min(1),
  channels: z.record(z.uuid(), z.uuid()),
});
const HintsSchema = z.record(z.string(), z.record(z.uuid(), ServerHintsSchema));

function readHints(): z.infer<typeof HintsSchema> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const result = HintsSchema.safeParse(raw ? JSON.parse(raw) : {});
    return result.success ? result.data : {};
  } catch {
    return {};
  }
}

// Persist mappings, not content. Each fresh server snapshot replaces its hints,
// including removal of channels that were deleted or are no longer text channels.
export function rememberChannelNavigationHints(
  account: UserRef,
  servers: Record<string, ServerWithChannels>
): void {
  if (Object.keys(servers).length === 0) return;
  const hints = readHints();
  const key = accountStorageKey(account);
  const previous = hints[key] ?? {};
  const next = { ...previous };
  for (const { server, channels } of Object.values(servers)) {
    next[server.id] = {
      host: server.host,
      channels: Object.fromEntries(
        channels.flatMap((channel) =>
          channel.kind === "text" ? [[channel.id, channel.text_channel_id]] : []
        )
      ),
    };
  }
  if (JSON.stringify(previous) === JSON.stringify(next)) return;
  hints[key] = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(hints));
  } catch {
    // Storage is optional; ordinary metadata-first loading still works.
  }
}

type NavigationPrefetch = {
  textChannelId: string;
  targetHost: string | null;
  history: Promise<Message[] | null>;
  updates: Message[];
};
let pending: NavigationPrefetch | null = null;

export function cancelChannelNavigationPrefetch(): void {
  pending = null;
}

export function startChannelNavigationPrefetch(
  account: UserRef,
  route: AppRoute,
  cachedMessages: Record<string, Message[]> = {}
): void {
  pending = null;
  if (route.screen !== "channel" && route.screen !== "channel-members") return;
  const server = readHints()[accountStorageKey(account)]?.[route.serverId];
  const textChannelId = server?.channels[route.channelId];
  if (!server || !textChannelId) return;
  // Reconnects can rerun startup while a channel is already cached or loading.
  if (textChannelId in cachedMessages) return;
  const targetHost = server.host === account.host ? null : server.host;
  pending = {
    textChannelId,
    targetHost,
    history: requestExpected("messages_get_by_text_channel", {
      type: "messages_get_by_text_channel",
      data: { text_channel_id: textChannelId, target_host: targetHost },
    })
      .then((reply) => reply.data)
      .catch(() => null),
    updates: [],
  };
}

// History and live updates stay outside the message cache until a normal fetch
// supplies a text-channel ID and host confirmed by fresh channel metadata.
export function takeChannelNavigationPrefetch(
  textChannelId: string,
  targetHost: string | null
): Promise<Message[] | null> | null {
  const prefetch = pending;
  if (!prefetch) return null;
  pending = null;
  if (
    prefetch.textChannelId !== textChannelId ||
    prefetch.targetHost !== targetHost
  )
    return null;
  return prefetch.history.then((history) =>
    history === null ? null : mergeMessages(history, prefetch.updates)
  );
}

export function captureChannelNavigationUpdate(message: Message): void {
  if (pending?.textChannelId === message.text_channel_id)
    pending.updates.push(message);
}
