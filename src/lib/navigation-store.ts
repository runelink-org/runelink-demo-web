import { create } from "zustand";
import {
  bindStoreToActiveAccount,
  type ChannelId,
  type ServerId,
} from "@/lib/runelink-store-utils";

type NavigationState = {
  selectedServerId: ServerId | null;
  selectedChannelIdByServerId: Record<string, ChannelId | null>;
  selectServer: (serverId: ServerId | null) => void;
  selectChannel: (serverId: ServerId, channelId: ChannelId | null) => void;
  reset: () => void;
};

const initialState = {
  selectedServerId: null,
  selectedChannelIdByServerId: {},
};

export const useNavigationStore = create<NavigationState>((set) => ({
  ...initialState,
  selectServer(serverId) {
    set((state) =>
      state.selectedServerId === serverId
        ? state
        : { selectedServerId: serverId }
    );
  },
  selectChannel(serverId, channelId) {
    set((state) => {
      const currentChannelId =
        state.selectedChannelIdByServerId[serverId] ?? null;
      if (
        state.selectedServerId === serverId &&
        currentChannelId === channelId
      ) {
        return state;
      }

      return {
        selectedServerId: serverId,
        selectedChannelIdByServerId: {
          ...state.selectedChannelIdByServerId,
          [serverId]: channelId,
        },
      };
    });
  },
  reset() {
    set(initialState);
  },
}));

bindStoreToActiveAccount(() => {
  useNavigationStore.getState().reset();
});
