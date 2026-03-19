import {
  RunelinkConnection,
  type RunelinkConnectionStatus,
} from "@runelink/sdk";
import { create } from "zustand";

const connection = new RunelinkConnection("localhost", {
  autoReconnect: true,
});

let listenersInitialized = false;

type RunelinkConnectionStore = {
  initialized: boolean;
  status: RunelinkConnectionStatus;
  lastError: string | null;
  lastMessageSentAt: string | null;
  lastMessageReceivedAt: string | null;
  start: () => Promise<void>;
  ping: () => Promise<boolean>;
  disconnect: () => void;
};

export const useRunelinkConnectionStore = create<RunelinkConnectionStore>(
  (set, get) => {
    function initializeListeners() {
      if (listenersInitialized) {
        return;
      }

      listenersInitialized = true;

      connection.subscribeStatus((status) => {
        set({ status });
      });

      connection.onError((error) => {
        set({ lastError: error.message });
      });
    }

    return {
      initialized: false,
      status: connection.getStatus(),
      lastError: null,
      lastMessageSentAt: null,
      lastMessageReceivedAt: null,
      async start() {
        initializeListeners();

        if (!get().initialized) {
          set({ initialized: true });
        }

        try {
          await connection.connect();
        } catch (error) {
          set({
            lastError:
              error instanceof Error ? error.message : "Failed to connect",
          });
        }
      },
      async ping() {
        initializeListeners();
        set({
          lastError: null,
          lastMessageSentAt: new Date().toLocaleTimeString(),
        });

        try {
          const reply = await connection.send({ type: "ping" });

          if (reply.type !== "pong") {
            throw new Error(`Unexpected reply type: ${reply.type}`);
          }

          set({
            lastMessageReceivedAt: new Date().toLocaleTimeString(),
          });
          return true;
        } catch (error) {
          set({
            lastError: error instanceof Error ? error.message : "Ping failed",
          });
          return false;
        }
      },
      disconnect() {
        connection.disconnect();
      },
    };
  }
);
