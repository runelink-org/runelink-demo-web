import {
  cancelChannelNavigationPrefetch,
  takeChannelNavigationPrefetch,
} from "@/lib/channel-navigation-hints";
import { mergeMessages } from "./message-cache";
import { resourceKey, textChannelRef } from "@runelink/sdk";
import type {
  Message,
  NewMessage,
  ResourceKey,
  ResourceRef,
} from "@runelink/sdk";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Option from "effect/Option";
import { getState, setState, stateAtom } from "@/lib/atom-registry";
import { requestFailureMessage } from "@/lib/request-failure";
import { request } from "@/lib/runelink-session";
import type { RequestFailure, RunelinkSession } from "@/lib/runelink-session";
import { bindStoreToActiveAccount } from "@/lib/runelink-store-utils";

type MessagesState = {
  messagesByTextChannelKey: Record<ResourceKey, readonly Message[]>;
  hasFetchedByTextChannelKey: Record<ResourceKey, boolean>;
  isLoadingByTextChannelKey: Record<ResourceKey, boolean>;
  errorByTextChannelKey: Record<ResourceKey, string | null>;
};

const initialState: MessagesState = {
  messagesByTextChannelKey: {},
  hasFetchedByTextChannelKey: {},
  isLoadingByTextChannelKey: {},
  errorByTextChannelKey: {},
};

export const messagesAtom = stateAtom(initialState);

type History = Deferred.Deferred<readonly Message[], RequestFailure>;
let pendingFetches = new Map<ResourceKey, History>();

function storeMessages(
  textChannelKey: ResourceKey,
  messages: readonly Message[]
): void {
  setState(messagesAtom, (state) => ({
    messagesByTextChannelKey: {
      ...state.messagesByTextChannelKey,
      [textChannelKey]: mergeMessages(
        state.messagesByTextChannelKey[textChannelKey] ?? [],
        messages
      ),
    },
  }));
}

// Loads a channel's history once. Concurrent callers, such as a hover prefetch
// and opening the channel, share one request.
export function fetchMessagesByTextChannel(
  textChannel: ResourceRef
): Effect.Effect<readonly Message[], RequestFailure, RunelinkSession> {
  const textChannelKey = resourceKey(textChannel);
  // Uninterruptible until the shared load is running, so it is never
  // registered without starting
  return Effect.uninterruptibleMask((restore) =>
    Effect.suspend(() => {
      const state = getState(messagesAtom);
      if (state.hasFetchedByTextChannelKey[textChannelKey]) {
        return Effect.succeed(
          state.messagesByTextChannelKey[textChannelKey] ?? []
        );
      }
      const pending = pendingFetches.get(textChannelKey);
      if (pending) return restore(Deferred.await(pending));

      // Reset replaces this map so an old account's reply cannot fill its
      // successor's cache. A channel removed while loading, such as by a
      // deletion update, has left the cache and must not be restored.
      const requests = pendingFetches;
      const isStale = () =>
        requests !== pendingFetches ||
        !(textChannelKey in getState(messagesAtom).messagesByTextChannelKey);
      const prefetchedHistory = takeChannelNavigationPrefetch(textChannel);
      setState(messagesAtom, (currentState) => ({
        // Register the channel before requesting history so updates received
        // during the first fetch are retained and merged with its response.
        messagesByTextChannelKey: {
          ...currentState.messagesByTextChannelKey,
          [textChannelKey]:
            currentState.messagesByTextChannelKey[textChannelKey] ?? [],
        },
        isLoadingByTextChannelKey: {
          ...currentState.isLoadingByTextChannelKey,
          [textChannelKey]: true,
        },
        errorByTextChannelKey: {
          ...currentState.errorByTextChannelKey,
          [textChannelKey]: null,
        },
      }));

      const load = Effect.gen(function* () {
        const history = prefetchedHistory ? yield* prefetchedHistory : null;
        if (isStale()) return history ?? [];
        const messages =
          history ??
          (yield* request({
            type: "messages_get_by_text_channel",
            data: { text_channel: textChannel },
          })).data;
        if (isStale()) return messages;

        setState(messagesAtom, (currentState) => ({
          hasFetchedByTextChannelKey: {
            ...currentState.hasFetchedByTextChannelKey,
            [textChannelKey]: true,
          },
          messagesByTextChannelKey: {
            ...currentState.messagesByTextChannelKey,
            [textChannelKey]: mergeMessages(
              currentState.messagesByTextChannelKey[textChannelKey] ?? [],
              messages
            ),
          },
          isLoadingByTextChannelKey: {
            ...currentState.isLoadingByTextChannelKey,
            [textChannelKey]: false,
          },
        }));
        return messages;
      }).pipe(
        Effect.onError((cause) =>
          Effect.sync(() => {
            if (isStale()) return;
            setState(messagesAtom, (currentState) => ({
              isLoadingByTextChannelKey: {
                ...currentState.isLoadingByTextChannelKey,
                [textChannelKey]: false,
              },
              errorByTextChannelKey: {
                ...currentState.errorByTextChannelKey,
                [textChannelKey]: Option.match(Cause.findErrorOption(cause), {
                  onNone: () => "Failed to load channel messages",
                  onSome: requestFailureMessage,
                }),
              },
            }));
          })
        ),
        Effect.ensuring(Effect.sync(() => requests.delete(textChannelKey))),
        Effect.withSpan("Messages.fetchByTextChannel")
      );

      const history: History = Deferred.makeUnsafe();
      requests.set(textChannelKey, history);
      // Detached, so a caller that stops waiting does not cancel the load for
      // the others
      return Effect.forkDetach(Deferred.into(load, history), {
        startImmediately: true,
      }).pipe(Effect.andThen(restore(Deferred.await(history))));
    })
  );
}

export const createMessage = Effect.fn("Messages.create")(function* (
  textChannel: ResourceRef,
  newMessage: NewMessage
) {
  const reply = yield* request({
    type: "messages_create",
    data: {
      text_channel: textChannel,
      new_message: newMessage,
    },
  });

  storeMessages(resourceKey(textChannel), [reply.data]);
  return reply.data;
});

// Messages this client is deleting, whose deletion updates can arrive before
// the reply
const deletingMessages = new Set<ResourceKey>();

export function isDeletingMessage(message: ResourceRef): boolean {
  return deletingMessages.has(resourceKey(message));
}

export const deleteMessage = Effect.fn("Messages.delete")(function* (
  message: Message
) {
  const key = resourceKey(message);
  deletingMessages.add(key);
  const reply = yield* request({
    type: "messages_delete",
    data: { message: { host: message.host, id: message.id } },
  }).pipe(Effect.ensuring(Effect.sync(() => deletingMessages.delete(key))));

  storeMessages(resourceKey(textChannelRef(message)), [reply.data]);
});

export function resetMessages(): void {
  cancelChannelNavigationPrefetch();
  pendingFetches = new Map();
  setState(messagesAtom, initialState);
}

bindStoreToActiveAccount(resetMessages);
