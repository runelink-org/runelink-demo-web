import { type Message, type NewMessage } from "@runelink/sdk";
import { create } from "zustand";
import { requestExpected } from "@/lib/runelink-request";
import {
  bindStoreToActiveAccount,
  type ChannelId,
  type MessageId,
  serverChannelKey,
  type ServerId,
  type TargetHost,
} from "@/lib/runelink-store-utils";

type MessagesState = {
  allMessages: Message[];
  messagesByServerId: Record<string, Message[]>;
  messagesByChannelKey: Record<string, Message[]>;
  messageById: Record<string, Message>;
  isLoading: boolean;
  isLoadingByServerId: Record<string, boolean>;
  isLoadingByChannelKey: Record<string, boolean>;
  error: string | null;
  errorByServerId: Record<string, string | null>;
  errorByChannelKey: Record<string, string | null>;
  fetchMessages: (targetHost?: TargetHost) => Promise<Message[]>;
  fetchMessagesByServer: (
    serverId: ServerId,
    targetHost?: TargetHost
  ) => Promise<Message[]>;
  fetchMessagesByChannel: (
    serverId: ServerId,
    channelId: ChannelId,
    targetHost?: TargetHost
  ) => Promise<Message[]>;
  fetchMessageById: (
    serverId: ServerId,
    channelId: ChannelId,
    messageId: MessageId,
    targetHost?: TargetHost
  ) => Promise<Message>;
  createMessage: (
    serverId: ServerId,
    channelId: ChannelId,
    newMessage: NewMessage,
    targetHost?: TargetHost
  ) => Promise<Message>;
  deleteMessage: (
    serverId: ServerId,
    channelId: ChannelId,
    messageId: MessageId,
    targetHost?: TargetHost
  ) => Promise<void>;
  reset: () => void;
};

const initialState = {
  allMessages: [],
  messagesByServerId: {},
  messagesByChannelKey: {},
  messageById: {},
  isLoading: false,
  isLoadingByServerId: {},
  isLoadingByChannelKey: {},
  error: null,
  errorByServerId: {},
  errorByChannelKey: {},
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
        allMessages: reply.data,
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
          const key = serverChannelKey(serverId, message.channel_id);
          groups[key] = [...(groups[key] ?? []), message];
          return groups;
        },
        {}
      );

      set((state) => ({
        messagesByServerId: {
          ...state.messagesByServerId,
          [serverId]: reply.data,
        },
        messagesByChannelKey: {
          ...state.messagesByChannelKey,
          ...channelMessages,
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

  async fetchMessagesByChannel(serverId, channelId, targetHost = null) {
    const channelKey = serverChannelKey(serverId, channelId);
    set((state) => ({
      isLoadingByChannelKey: {
        ...state.isLoadingByChannelKey,
        [channelKey]: true,
      },
      errorByChannelKey: {
        ...state.errorByChannelKey,
        [channelKey]: null,
      },
    }));

    try {
      const reply = await requestExpected("messages_get_by_channel", {
        type: "messages_get_by_channel",
        data: {
          server_id: serverId,
          channel_id: channelId,
          target_host: targetHost,
        },
      });

      set((state) => ({
        messagesByChannelKey: {
          ...state.messagesByChannelKey,
          [channelKey]: reply.data,
        },
        messageById: {
          ...state.messageById,
          ...mergeMessages(reply.data),
        },
        isLoadingByChannelKey: {
          ...state.isLoadingByChannelKey,
          [channelKey]: false,
        },
        errorByChannelKey: {
          ...state.errorByChannelKey,
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
        isLoadingByChannelKey: {
          ...state.isLoadingByChannelKey,
          [channelKey]: false,
        },
        errorByChannelKey: {
          ...state.errorByChannelKey,
          [channelKey]: message,
        },
      }));
      throw error;
    }
  },

  async fetchMessageById(serverId, channelId, messageId, targetHost = null) {
    const channelKey = serverChannelKey(serverId, channelId);
    set((state) => ({
      isLoadingByChannelKey: {
        ...state.isLoadingByChannelKey,
        [channelKey]: true,
      },
      errorByChannelKey: {
        ...state.errorByChannelKey,
        [channelKey]: null,
      },
    }));

    try {
      const reply = await requestExpected("messages_get_by_id", {
        type: "messages_get_by_id",
        data: {
          server_id: serverId,
          channel_id: channelId,
          message_id: messageId,
          target_host: targetHost,
        },
      });

      set((state) => ({
        messagesByChannelKey: {
          ...state.messagesByChannelKey,
          [channelKey]: upsertMessage(
            state.messagesByChannelKey[channelKey] ?? [],
            reply.data
          ),
        },
        messagesByServerId: {
          ...state.messagesByServerId,
          [serverId]: upsertMessage(
            state.messagesByServerId[serverId] ?? [],
            reply.data
          ),
        },
        messageById: {
          ...state.messageById,
          [reply.data.id]: reply.data,
        },
        isLoadingByChannelKey: {
          ...state.isLoadingByChannelKey,
          [channelKey]: false,
        },
        errorByChannelKey: {
          ...state.errorByChannelKey,
          [channelKey]: null,
        },
      }));

      return reply.data;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load message";
      set((state) => ({
        isLoadingByChannelKey: {
          ...state.isLoadingByChannelKey,
          [channelKey]: false,
        },
        errorByChannelKey: {
          ...state.errorByChannelKey,
          [channelKey]: message,
        },
      }));
      throw error;
    }
  },

  async createMessage(serverId, channelId, newMessage, targetHost = null) {
    const channelKey = serverChannelKey(serverId, channelId);
    set((state) => ({
      isLoadingByChannelKey: {
        ...state.isLoadingByChannelKey,
        [channelKey]: true,
      },
      errorByChannelKey: {
        ...state.errorByChannelKey,
        [channelKey]: null,
      },
    }));

    try {
      const reply = await requestExpected("messages_create", {
        type: "messages_create",
        data: {
          server_id: serverId,
          channel_id: channelId,
          new_message: newMessage,
          target_host: targetHost,
        },
      });

      set((state) => ({
        allMessages: upsertMessage(state.allMessages, reply.data),
        messagesByServerId: {
          ...state.messagesByServerId,
          [serverId]: upsertMessage(
            state.messagesByServerId[serverId] ?? [],
            reply.data
          ),
        },
        messagesByChannelKey: {
          ...state.messagesByChannelKey,
          [channelKey]: upsertMessage(
            state.messagesByChannelKey[channelKey] ?? [],
            reply.data
          ),
        },
        messageById: {
          ...state.messageById,
          [reply.data.id]: reply.data,
        },
        isLoadingByChannelKey: {
          ...state.isLoadingByChannelKey,
          [channelKey]: false,
        },
        errorByChannelKey: {
          ...state.errorByChannelKey,
          [channelKey]: null,
        },
      }));

      return reply.data;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create message";
      set((state) => ({
        isLoadingByChannelKey: {
          ...state.isLoadingByChannelKey,
          [channelKey]: false,
        },
        errorByChannelKey: {
          ...state.errorByChannelKey,
          [channelKey]: message,
        },
      }));
      throw error;
    }
  },

  async deleteMessage(serverId, channelId, messageId, targetHost = null) {
    const channelKey = serverChannelKey(serverId, channelId);
    set((state) => ({
      isLoadingByChannelKey: {
        ...state.isLoadingByChannelKey,
        [channelKey]: true,
      },
      errorByChannelKey: {
        ...state.errorByChannelKey,
        [channelKey]: null,
      },
    }));

    try {
      await requestExpected("messages_delete", {
        type: "messages_delete",
        data: {
          server_id: serverId,
          channel_id: channelId,
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
          messagesByChannelKey: {
            ...state.messagesByChannelKey,
            [channelKey]: removeMessage(
              state.messagesByChannelKey[channelKey] ?? [],
              messageId
            ),
          },
          messageById: nextMessageById,
          isLoadingByChannelKey: {
            ...state.isLoadingByChannelKey,
            [channelKey]: false,
          },
          errorByChannelKey: {
            ...state.errorByChannelKey,
            [channelKey]: null,
          },
        };
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete message";
      set((state) => ({
        isLoadingByChannelKey: {
          ...state.isLoadingByChannelKey,
          [channelKey]: false,
        },
        errorByChannelKey: {
          ...state.errorByChannelKey,
          [channelKey]: message,
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
