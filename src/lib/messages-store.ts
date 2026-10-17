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
  isLoadingByTextChannelId: {},
  errorByTextChannelId: {},
};

function upsertMessage(messages: Message[], nextMessage: Message): Message[] {
  return sortMessages([
    ...messages.filter((message) => message.id !== nextMessage.id),
    nextMessage,
  ]);
}

function removeMessage(messages: Message[], messageId: MessageId): Message[] {
  return messages.filter((message) => message.id !== messageId);
}

function sortMessages(messages: Message[]): Message[] {
  return [...messages].sort(
    (left, right) => left.created_at.getTime() - right.created_at.getTime()
  );
}

export const useMessagesStore = create<MessagesState>((set) => ({
  ...initialState,

  async fetchMessagesByTextChannel(textChannelId, targetHost = null) {
    set((state) => ({
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
        messagesByTextChannelId: {
          ...state.messagesByTextChannelId,
          [textChannelId]: sortMessages(reply.data),
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
        [textChannelId]: upsertMessage(
          state.messagesByTextChannelId[textChannelId] ?? [],
          reply.data
        ),
      },
    }));

    return reply.data;
  },

  async deleteMessage(textChannelId, messageId, targetHost = null) {
    await requestExpected("messages_delete", {
      type: "messages_delete",
      data: {
        message_id: messageId,
        target_host: targetHost,
      },
    });

    set((state) => ({
      messagesByTextChannelId: {
        ...state.messagesByTextChannelId,
        [textChannelId]: removeMessage(
          state.messagesByTextChannelId[textChannelId] ?? [],
          messageId
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
