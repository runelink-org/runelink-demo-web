import { type Message, type NewMessage } from "@runelink/sdk";
import { create } from "zustand";
import { requestExpected } from "@/lib/runelink-request";
import {
  bindStoreToActiveAccount,
  type MessageId,
  type ServerId,
  type TargetHost,
  type TextChannelId,
} from "@/lib/runelink-store-utils";

type MessagesState = {
  allMessages: Message[];
  messagesByServerId: Record<string, Message[]>;
  messagesByTextChannelId: Record<string, Message[]>;
  messageById: Record<string, Message>;
  isLoading: boolean;
  isLoadingByServerId: Record<string, boolean>;
  isLoadingByTextChannelId: Record<string, boolean>;
  error: string | null;
  errorByServerId: Record<string, string | null>;
  errorByTextChannelId: Record<string, string | null>;
  fetchMessages: (targetHost?: TargetHost) => Promise<Message[]>;
  fetchMessagesByServer: (
    serverId: ServerId,
    targetHost?: TargetHost
  ) => Promise<Message[]>;
  fetchMessagesByTextChannel: (
    textChannelId: TextChannelId,
    targetHost?: TargetHost
  ) => Promise<Message[]>;
  fetchMessageById: (
    messageId: MessageId,
    targetHost?: TargetHost
  ) => Promise<Message>;
  createMessage: (
    serverId: ServerId,
    textChannelId: TextChannelId,
    newMessage: NewMessage,
    targetHost?: TargetHost
  ) => Promise<Message>;
  deleteMessage: (
    serverId: ServerId,
    textChannelId: TextChannelId,
    messageId: MessageId,
    targetHost?: TargetHost
  ) => Promise<void>;
  reset: () => void;
};

const initialState = {
  allMessages: [],
  messagesByServerId: {},
  messagesByTextChannelId: {},
  messageById: {},
  isLoading: false,
  isLoadingByServerId: {},
  isLoadingByTextChannelId: {},
  error: null,
  errorByServerId: {},
  errorByTextChannelId: {},
};

function upsertMessage(messages: Message[], nextMessage: Message): Message[] {
  return [
    ...messages.filter((message) => message.id !== nextMessage.id),
    nextMessage,
  ];
}

function removeMessage(messages: Message[], messageId: MessageId): Message[] {
  return messages.filter((message) => message.id !== messageId);
}

function mergeMessages(messages: Message[]): Record<string, Message> {
  return Object.fromEntries(messages.map((message) => [message.id, message]));
}

function sortMessages(messages: Message[]): Message[] {
  return [...messages].sort(
    (left, right) => left.created_at.getTime() - right.created_at.getTime()
  );
}

export const useMessagesStore = create<MessagesState>((set) => ({
  ...initialState,

  async fetchMessages(targetHost = null) {
    set({ isLoading: true, error: null });

    try {
      const reply = await requestExpected("messages_get_all", {
        type: "messages_get_all",
        data: { target_host: targetHost },
      });

      set((state) => ({
        allMessages: sortMessages(reply.data),
        messageById: {
          ...state.messageById,
          ...mergeMessages(reply.data),
        },
        isLoading: false,
        error: null,
      }));

      return reply.data;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load messages";
      set({ isLoading: false, error: message });
      throw error;
    }
  },

  async fetchMessagesByServer(serverId, targetHost = null) {
    set((state) => ({
      isLoadingByServerId: {
        ...state.isLoadingByServerId,
        [serverId]: true,
      },
      errorByServerId: {
        ...state.errorByServerId,
        [serverId]: null,
      },
    }));

    try {
      const reply = await requestExpected("messages_get_by_server", {
        type: "messages_get_by_server",
        data: {
          server_id: serverId,
          target_host: targetHost,
        },
      });

      const channelMessages = reply.data.reduce<Record<string, Message[]>>(
        (groups, message) => {
          const key = message.text_channel_id;
          groups[key] = [...(groups[key] ?? []), message];
          return groups;
        },
        {}
      );

      set((state) => ({
        messagesByServerId: {
          ...state.messagesByServerId,
          [serverId]: sortMessages(reply.data),
        },
        messagesByTextChannelId: {
          ...state.messagesByTextChannelId,
          ...Object.fromEntries(
            Object.entries(channelMessages).map(([key, messages]) => [
              key,
              sortMessages(messages),
            ])
          ),
        },
        messageById: {
          ...state.messageById,
          ...mergeMessages(reply.data),
        },
        isLoadingByServerId: {
          ...state.isLoadingByServerId,
          [serverId]: false,
        },
        errorByServerId: {
          ...state.errorByServerId,
          [serverId]: null,
        },
      }));

      return reply.data;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load server messages";
      set((state) => ({
        isLoadingByServerId: {
          ...state.isLoadingByServerId,
          [serverId]: false,
        },
        errorByServerId: {
          ...state.errorByServerId,
          [serverId]: message,
        },
      }));
      throw error;
    }
  },

  async fetchMessagesByTextChannel(textChannelId, targetHost = null) {
    const channelKey = textChannelId;
    set((state) => ({
      isLoadingByTextChannelId: {
        ...state.isLoadingByTextChannelId,
        [channelKey]: true,
      },
      errorByTextChannelId: {
        ...state.errorByTextChannelId,
        [channelKey]: null,
      },
    }));

    try {
      const reply = await requestExpected("messages_get_by_channel", {
        type: "messages_get_by_channel",
        data: {
          text_channel_id: textChannelId,
          target_host: targetHost,
        },
      });

      set((state) => ({
        messagesByTextChannelId: {
          ...state.messagesByTextChannelId,
          [channelKey]: sortMessages(reply.data),
        },
        messageById: {
          ...state.messageById,
          ...mergeMessages(reply.data),
        },
        isLoadingByTextChannelId: {
          ...state.isLoadingByTextChannelId,
          [channelKey]: false,
        },
        errorByTextChannelId: {
          ...state.errorByTextChannelId,
          [channelKey]: null,
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
          [channelKey]: false,
        },
        errorByTextChannelId: {
          ...state.errorByTextChannelId,
          [channelKey]: message,
        },
      }));
      throw error;
    }
  },

  async fetchMessageById(messageId, targetHost = null) {
    const reply = await requestExpected("messages_get_by_id", {
      type: "messages_get_by_id",
      data: {
        message_id: messageId,
        target_host: targetHost,
      },
    });
    const channelKey = reply.data.text_channel_id;

    set((state) => ({
      messagesByTextChannelId: {
        ...state.messagesByTextChannelId,
        [channelKey]: sortMessages(
          upsertMessage(
            state.messagesByTextChannelId[channelKey] ?? [],
            reply.data
          )
        ),
      },
      messageById: {
        ...state.messageById,
        [reply.data.id]: reply.data,
      },
    }));

    return reply.data;
  },

  async createMessage(serverId, textChannelId, newMessage, targetHost = null) {
    const channelKey = textChannelId;
    const reply = await requestExpected("messages_create", {
      type: "messages_create",
      data: {
        text_channel_id: textChannelId,
        new_message: newMessage,
        target_host: targetHost,
      },
    });

    set((state) => ({
      allMessages: sortMessages(upsertMessage(state.allMessages, reply.data)),
      messagesByServerId: {
        ...state.messagesByServerId,
        [serverId]: sortMessages(
          upsertMessage(state.messagesByServerId[serverId] ?? [], reply.data)
        ),
      },
      messagesByTextChannelId: {
        ...state.messagesByTextChannelId,
        [channelKey]: sortMessages(
          upsertMessage(
            state.messagesByTextChannelId[channelKey] ?? [],
            reply.data
          )
        ),
      },
      messageById: {
        ...state.messageById,
        [reply.data.id]: reply.data,
      },
    }));

    return reply.data;
  },

  async deleteMessage(serverId, textChannelId, messageId, targetHost = null) {
    const channelKey = textChannelId;
    set((state) => ({
      isLoadingByTextChannelId: {
        ...state.isLoadingByTextChannelId,
        [channelKey]: true,
      },
      errorByTextChannelId: {
        ...state.errorByTextChannelId,
        [channelKey]: null,
      },
    }));

    try {
      await requestExpected("messages_delete", {
        type: "messages_delete",
        data: {
          message_id: messageId,
          target_host: targetHost,
        },
      });

      set((state) => {
        const nextMessageById = { ...state.messageById };
        delete nextMessageById[messageId];

        return {
          allMessages: removeMessage(state.allMessages, messageId),
          messagesByServerId: {
            ...state.messagesByServerId,
            [serverId]: removeMessage(
              state.messagesByServerId[serverId] ?? [],
              messageId
            ),
          },
          messagesByTextChannelId: {
            ...state.messagesByTextChannelId,
            [channelKey]: removeMessage(
              state.messagesByTextChannelId[channelKey] ?? [],
              messageId
            ),
          },
          messageById: nextMessageById,
          isLoadingByTextChannelId: {
            ...state.isLoadingByTextChannelId,
            [channelKey]: false,
          },
          errorByTextChannelId: {
            ...state.errorByTextChannelId,
            [channelKey]: null,
          },
        };
      });
    } catch (error) {
      set((state) => ({
        isLoadingByTextChannelId: {
          ...state.isLoadingByTextChannelId,
          [channelKey]: false,
        },
      }));
      throw error;
    }
  },

  reset() {
    set(initialState);
  },
}));

bindStoreToActiveAccount(() => {
  useMessagesStore.getState().reset();
});
