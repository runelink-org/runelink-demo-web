import { ResourceRefSchema, resourceKey, textChannelRef } from "@runelink/sdk";
import type {
  Message,
  ResourceKey,
  ResourceRef,
  ServerWithChannels,
  UserRef,
} from "@runelink/sdk";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { accountStorageKey } from "@/lib/account-storage";
import type { AppRoute } from "@/lib/app-route";
import { mergeMessages } from "@/lib/message-cache";
import { request } from "@/lib/runelink-session";

// Hints are by account, then by server key. Earlier versions keyed servers by
// ID alone, under a key without the version.
const STORAGE_KEY = "runelink.demo.channel-navigation-hints.v2";
const Uuid = ResourceRefSchema.fields.id;
// Text channel IDs by server channel ID, both on the server's host
const ServerHintsSchema = Schema.Record(Uuid, Uuid);
const HintsSchema = Schema.Record(
  Schema.String,
  Schema.Record(Schema.String, ServerHintsSchema)
);
const decodeHints = Schema.decodeUnknownOption(
  Schema.fromJsonString(HintsSchema)
);

type Hints = Record<string, (typeof HintsSchema.Type)[string]>;

const readStoredHints = Option.liftThrowable(() =>
  window.localStorage.getItem(STORAGE_KEY)
);
const saveHints = Option.liftThrowable((hints: Hints) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(hints));
});

function readHints(): Hints {
  return readStoredHints().pipe(
    Option.flatMap(decodeHints),
    Option.match({ onNone: () => ({}), onSome: (hints) => ({ ...hints }) })
  );
}

// Persist mappings, not content. Each fresh server snapshot replaces its hints,
// including removal of channels that were deleted or are no longer text channels.
export function rememberChannelNavigationHints(
  account: UserRef,
  servers: Record<ResourceKey, ServerWithChannels>
): void {
  if (Object.keys(servers).length === 0) return;
  const hints = readHints();
  const key = accountStorageKey(account);
  const previous = hints[key] ?? {};
  const next = { ...previous };
  for (const { server, channels } of Object.values(servers)) {
    next[resourceKey(server)] = Object.fromEntries(
      channels.flatMap((channel) =>
        channel.kind === "text" ? [[channel.id, channel.text_channel_id]] : []
      )
    );
  }
  if (JSON.stringify(previous) === JSON.stringify(next)) return;
  hints[key] = next;
  // Storage is optional. Ordinary metadata-first loading still works.
  saveHints(hints);
}

type NavigationPrefetch = {
  textChannelKey: ResourceKey;
  history: Fiber.Fiber<readonly Message[] | null>;
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
  cachedMessages: Record<ResourceKey, readonly Message[]> = {}
) {
  cancelChannelNavigationPrefetch();
  if (route.screen !== "channel" && route.screen !== "channel-members") return;
  const textChannelId =
    readHints()[accountStorageKey(account)]?.[resourceKey(route.server)]?.[
      route.channelId
    ];
  if (!textChannelId) return;
  const textChannel = { host: route.server.host, id: textChannelId };
  const textChannelKey = resourceKey(textChannel);
  // Reconnects can rerun startup while a channel is already cached or loading.
  if (textChannelKey in cachedMessages) return;
  const history = yield* request({
    type: "messages_get_by_text_channel",
    data: { text_channel: textChannel },
  }).pipe(
    Effect.map((reply) => reply.data),
    // Any failure falls back to an ordinary fetch.
    Effect.catchCause(() => Effect.succeed(null)),
    Effect.forkDetach({ startImmediately: true })
  );
  pending = { textChannelKey, history, updates: [] };
});

// History and live updates stay outside the message cache until a normal fetch
// supplies a text channel confirmed by fresh channel metadata.
export function takeChannelNavigationPrefetch(
  textChannel: ResourceRef
): Effect.Effect<readonly Message[] | null> | null {
  const prefetch = pending;
  if (!prefetch) return null;
  pending = null;
  if (prefetch.textChannelKey !== resourceKey(textChannel)) {
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
  if (pending?.textChannelKey === resourceKey(textChannelRef(message))) {
    pending.updates.push(message);
  }
}
