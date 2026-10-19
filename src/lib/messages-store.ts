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

export const useMessagesStore = create<MessagesState>((set) => ({
  ...initialState,

  async fetchMessagesByTextChannel(textChannelId, targetHost = null) {
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

    try {
      const reply = await requestExpected("messages_get_by_text_channel", {
        type: "messages_get_by_text_channel",
        data: {
          text_channel_id: textChannelId,
          target_host: targetHost,
        },
      });

      set((state) => ({
        hasFetchedByTextChannelId: {
          ...state.hasFetchedByTextChannelId,
          [textChannelId]: true,
        },
        messagesByTextChannelId: {
          ...state.messagesByTextChannelId,
          [textChannelId]: mergeMessages(
            state.messagesByTextChannelId[textChannelId] ?? [],
            reply.data
          ),
        },
        isLoadingByTextChannelId: {
          ...state.isLoadingByTextChannelId,
          [textChannelId]: false,
        },
      }));

      return reply.data;
    } catch (error) {
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
    }
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
    set(initialState);
  },
}));

bindStoreToActiveAccount(() => {
  useMessagesStore.getState().reset();
});
