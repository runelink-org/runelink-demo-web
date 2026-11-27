import {
  cancelChannelNavigationPrefetch,
  takeChannelNavigationPrefetch,
} from "@/lib/channel-navigation-hints";
import { mergeMessages } from "./message-cache";
import { type Message, type NewMessage } from "@runelink/sdk";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Option from "effect/Option";
import { getState, setState, stateAtom } from "@/lib/atom-registry";
import { requestFailureMessage } from "@/lib/request-failure";
import {
  request,
  type RequestFailure,
  type RunelinkSession,
} from "@/lib/runelink-session";
import {
  bindStoreToActiveAccount,
  type MessageId,
  type TargetHost,
  type TextChannelId,
} from "@/lib/runelink-store-utils";

type MessagesState = {
  messagesByTextChannelId: Record<string, ReadonlyArray<Message>>;
  hasFetchedByTextChannelId: Record<string, boolean>;
  isLoadingByTextChannelId: Record<string, boolean>;
  errorByTextChannelId: Record<string, string | null>;
};

const initialState: MessagesState = {
  messagesByTextChannelId: {},
  hasFetchedByTextChannelId: {},
  isLoadingByTextChannelId: {},
  errorByTextChannelId: {},
};

export const messagesAtom = stateAtom(initialState);

type History = Deferred.Deferred<ReadonlyArray<Message>, RequestFailure>;
let pendingFetches = new Map<string, History>();

function storeMessages(
  textChannelId: TextChannelId,
  messages: ReadonlyArray<Message>
): void {
  setState(messagesAtom, (state) => ({
    messagesByTextChannelId: {
      ...state.messagesByTextChannelId,
      [textChannelId]: mergeMessages(
        state.messagesByTextChannelId[textChannelId] ?? [],
        messages
      ),
    },
  }));
}

// Loads a channel's history once. Concurrent callers, such as a hover prefetch
// and opening the channel, share one request.
export function fetchMessagesByTextChannel(
  textChannelId: TextChannelId,
  targetHost: TargetHost = null
): Effect.Effect<ReadonlyArray<Message>, RequestFailure, RunelinkSession> {
  // Uninterruptible until the shared load is running, so it is never
  // registered without starting
  return Effect.uninterruptibleMask((restore) =>
    Effect.suspend(() => {
      const state = getState(messagesAtom);
      if (state.hasFetchedByTextChannelId[textChannelId]) {
        return Effect.succeed(
          state.messagesByTextChannelId[textChannelId] ?? []
        );
      }
      const pending = pendingFetches.get(textChannelId);
      if (pending) return restore(Deferred.await(pending));

      // Reset replaces this map so an old account's reply cannot fill its
      // successor's cache. A channel removed while loading, such as by a
      // deletion update, has left the cache and must not be restored.
      const requests = pendingFetches;
      const isStale = () =>
        requests !== pendingFetches ||
        !(textChannelId in getState(messagesAtom).messagesByTextChannelId);
      const prefetchedHistory = takeChannelNavigationPrefetch(
        textChannelId,
        targetHost
      );
      setState(messagesAtom, (state) => ({
        // Register the channel before requesting history so updates received
        // during the first fetch are retained and merged with its response.
        messagesByTextChannelId: {
          ...state.messagesByTextChannelId,
          [textChannelId]: state.messagesByTextChannelId[textChannelId] ?? [],
        },
        isLoadingByTextChannelId: {
          ...state.isLoadingByTextChannelId,
          [textChannelId]: true,
        },
        errorByTextChannelId: {
          ...state.errorByTextChannelId,
          [textChannelId]: null,
        },
      }));

      const load = Effect.gen(function* () {
        const history = prefetchedHistory ? yield* prefetchedHistory : null;
        if (isStale()) return history ?? [];
        const messages =
          history ??
          (yield* request({
            type: "messages_get_by_text_channel",
            data: {
              text_channel_id: textChannelId,
              target_host: targetHost,
            },
          })).data;
        if (isStale()) return messages;

        setState(messagesAtom, (state) => ({
          hasFetchedByTextChannelId: {
            ...state.hasFetchedByTextChannelId,
            [textChannelId]: true,
          },
          messagesByTextChannelId: {
            ...state.messagesByTextChannelId,
            [textChannelId]: mergeMessages(
              state.messagesByTextChannelId[textChannelId] ?? [],
              messages
            ),
          },
          isLoadingByTextChannelId: {
            ...state.isLoadingByTextChannelId,
            [textChannelId]: false,
          },
        }));
        return messages;
      }).pipe(
        Effect.onError((cause) =>
          Effect.sync(() => {
            if (isStale()) return;
            setState(messagesAtom, (state) => ({
              isLoadingByTextChannelId: {
                ...state.isLoadingByTextChannelId,
                [textChannelId]: false,
              },
              errorByTextChannelId: {
                ...state.errorByTextChannelId,
                [textChannelId]: Option.match(Cause.findErrorOption(cause), {
                  onNone: () => "Failed to load channel messages",
                  onSome: requestFailureMessage,
                }),
              },
            }));
          })
        ),
        Effect.ensuring(Effect.sync(() => requests.delete(textChannelId))),
        Effect.withSpan("Messages.fetchByTextChannel")
      );

      const history: History = Deferred.makeUnsafe();
      requests.set(textChannelId, history);
      // Detached, so a caller that stops waiting does not cancel the load for
      // the others
      return Effect.forkDetach(Deferred.into(load, history), {
        startImmediately: true,
      }).pipe(Effect.andThen(restore(Deferred.await(history))));
    })
  );
}

export const createMessage = Effect.fn("Messages.create")(function* (
  textChannelId: TextChannelId,
  newMessage: NewMessage,
  targetHost: TargetHost = null
) {
  const reply = yield* request({
    type: "messages_create",
    data: {
      text_channel_id: textChannelId,
      new_message: newMessage,
      target_host: targetHost,
    },
  });

  storeMessages(textChannelId, [reply.data]);
  return reply.data;
});

export const deleteMessage = Effect.fn("Messages.delete")(function* (
  textChannelId: TextChannelId,
  messageId: MessageId,
  targetHost: TargetHost = null
) {
  const reply = yield* request({
    type: "messages_delete",
    data: {
      message_id: messageId,
      target_host: targetHost,
    },
  });

  storeMessages(textChannelId, [reply.data]);
});

export function resetMessages(): void {
  cancelChannelNavigationPrefetch();
  pendingFetches = new Map();
  setState(messagesAtom, initialState);
}

bindStoreToActiveAccount(resetMessages);
