import type { Message, ServerWithChannels, UserRef } from "@runelink/sdk";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { accountStorageKey } from "@/lib/account-storage";
import type { AppRoute } from "@/lib/app-route";
import { mergeMessages } from "@/lib/message-cache";
import { request } from "@/lib/runelink-session";

const STORAGE_KEY = "runelink.demo.channel-navigation-hints";
const Uuid = Schema.String.check(Schema.isUUID());
const ServerHintsSchema = Schema.Struct({
  host: Schema.String.check(Schema.isMinLength(1)),
  channels: Schema.Record(Uuid, Uuid),
});
const HintsSchema = Schema.Record(
  Schema.String,
  Schema.Record(Uuid, ServerHintsSchema)
);
const decodeHints = Schema.decodeUnknownOption(
  Schema.fromJsonString(HintsSchema)
);

type Hints = Record<string, (typeof HintsSchema.Type)[string]>;

function readHints(): Hints {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? { ...Option.getOrElse(decodeHints(raw), () => ({})) } : {};
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
  history: Fiber.Fiber<ReadonlyArray<Message> | null>;
  updates: Message[];
};
let pending: NavigationPrefetch | null = null;

// Stops the prefetch, unless a fetch has taken it
export function cancelChannelNavigationPrefetch(): void {
  pending?.history.interruptUnsafe();
  pending = null;
}

// Requests the history of the channel a new tab opens on before its metadata
// arrives, using the mappings saved by an earlier visit.
export const startChannelNavigationPrefetch = Effect.fn(
  "ChannelNavigationHints.startPrefetch"
)(function* (
  account: UserRef,
  route: AppRoute,
  cachedMessages: Record<string, ReadonlyArray<Message>> = {}
) {
  cancelChannelNavigationPrefetch();
  if (route.screen !== "channel" && route.screen !== "channel-members") return;
  const server = readHints()[accountStorageKey(account)]?.[route.serverId];
  const textChannelId = server?.channels[route.channelId];
  if (!server || !textChannelId) return;
  // Reconnects can rerun startup while a channel is already cached or loading.
  if (textChannelId in cachedMessages) return;
  const targetHost = server.host === account.host ? null : server.host;
  const history = yield* request({
    type: "messages_get_by_text_channel",
    data: { text_channel_id: textChannelId, target_host: targetHost },
  }).pipe(
    Effect.map((reply) => reply.data),
    // Any failure falls back to an ordinary fetch.
    Effect.catchCause(() => Effect.succeed(null)),
    Effect.forkDetach({ startImmediately: true })
  );
  pending = { textChannelId, targetHost, history, updates: [] };
});

// History and live updates stay outside the message cache until a normal fetch
// supplies a text-channel ID and host confirmed by fresh channel metadata.
export function takeChannelNavigationPrefetch(
  textChannelId: string,
  targetHost: string | null
): Effect.Effect<ReadonlyArray<Message> | null> | null {
  const prefetch = pending;
  if (!prefetch) return null;
  pending = null;
  if (
    prefetch.textChannelId !== textChannelId ||
    prefetch.targetHost !== targetHost
  ) {
    prefetch.history.interruptUnsafe();
    return null;
  }
  return Fiber.join(prefetch.history).pipe(
    Effect.map((history) =>
      history === null ? null : mergeMessages(history, prefetch.updates)
    )
  );
}

export function captureChannelNavigationUpdate(message: Message): void {
  if (pending?.textChannelId === message.text_channel_id)
    pending.updates.push(message);
}
