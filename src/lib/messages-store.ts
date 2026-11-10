import {
  cancelChannelNavigationPrefetch,
  takeChannelNavigationPrefetch,
} from "@/lib/channel-navigation-hints";
import { mergeMessages } from "./message-cache";
import { type Message, type NewMessage } from "@runelink/sdk";
import { create } from "zustand";
import { requestExpected } from "@/lib/runelink-request";
import {
  bindStoreToActiveAccount,
  type MessageId,
  type TargetHost,
  type TextChannelId,
} from "@/lib/runelink-store-utils";

type MessagesState = {
  messagesByTextChannelId: Record<string, Message[]>;
  hasFetchedByTextChannelId: Record<string, boolean>;
  isLoadingByTextChannelId: Record<string, boolean>;
  errorByTextChannelId: Record<string, string | null>;
  fetchMessagesByTextChannel: (
    textChannelId: TextChannelId,
    targetHost?: TargetHost
  ) => Promise<Message[]>;
  createMessage: (
    textChannelId: TextChannelId,
    newMessage: NewMessage,
    targetHost?: TargetHost
  ) => Promise<Message>;
  deleteMessage: (
    textChannelId: TextChannelId,
    messageId: MessageId,
    targetHost?: TargetHost
  ) => Promise<void>;
  reset: () => void;
};

const initialState = {
  messagesByTextChannelId: {},
  hasFetchedByTextChannelId: {},
  isLoadingByTextChannelId: {},
  errorByTextChannelId: {},
};

let pendingFetches = new Map<string, Promise<Message[]>>();

export const useMessagesStore = create<MessagesState>((set, get) => ({
  ...initialState,

  fetchMessagesByTextChannel(textChannelId, targetHost = null) {
    if (get().hasFetchedByTextChannelId[textChannelId]) {
      return Promise.resolve(
        get().messagesByTextChannelId[textChannelId] ?? []
      );
    }
    const pending = pendingFetches.get(textChannelId);
    if (pending) return pending;

    // Reset replaces this map so an old account's reply cannot fill its successor's cache.
    const requests = pendingFetches;
    const prefetchedHistory = takeChannelNavigationPrefetch(
      textChannelId,
      targetHost
    );
    set((state) => ({
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

    const request = (async () => {
      try {
        const history = prefetchedHistory ? await prefetchedHistory : null;
        if (requests !== pendingFetches) return history ?? [];
        const messages =
          history ??
          (
            await requestExpected("messages_get_by_text_channel", {
              type: "messages_get_by_text_channel",
              data: {
                text_channel_id: textChannelId,
                target_host: targetHost,
              },
            })
          ).data;

        if (requests !== pendingFetches) return messages;

        set((state) => ({
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
      } catch (error) {
        if (requests !== pendingFetches) throw error;
        const message =
          error instanceof Error
            ? error.message
            : "Failed to load channel messages";
        set((state) => ({
          isLoadingByTextChannelId: {
            ...state.isLoadingByTextChannelId,
            [textChannelId]: false,
          },
          errorByTextChannelId: {
            ...state.errorByTextChannelId,
            [textChannelId]: message,
          },
        }));
        throw error;
      } finally {
        requests.delete(textChannelId);
      }
    })();
    requests.set(textChannelId, request);
    return request;
  },

  async createMessage(textChannelId, newMessage, targetHost = null) {
    const reply = await requestExpected("messages_create", {
      type: "messages_create",
      data: {
        text_channel_id: textChannelId,
        new_message: newMessage,
        target_host: targetHost,
      },
    });

    set((state) => ({
      messagesByTextChannelId: {
        ...state.messagesByTextChannelId,
        [textChannelId]: mergeMessages(
          state.messagesByTextChannelId[textChannelId] ?? [],
          [reply.data]
        ),
      },
    }));

    return reply.data;
  },

  async deleteMessage(textChannelId, messageId, targetHost = null) {
    const reply = await requestExpected("messages_delete", {
      type: "messages_delete",
      data: {
        message_id: messageId,
        target_host: targetHost,
      },
    });

    set((state) => ({
      messagesByTextChannelId: {
        ...state.messagesByTextChannelId,
        [textChannelId]: mergeMessages(
          state.messagesByTextChannelId[textChannelId] ?? [],
          [reply.data]
        ),
      },
    }));
  },

  reset() {
    cancelChannelNavigationPrefetch();
    pendingFetches = new Map();
    set(initialState);
  },
}));

bindStoreToActiveAccount(() => {
  useMessagesStore.getState().reset();
});
