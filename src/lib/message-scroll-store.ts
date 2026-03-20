import { create } from "zustand";
import { bindStoreToActiveAccount } from "@/lib/runelink-store-utils";

type ChannelScrollState = {
  scrollTop: number;
};

type MessageScrollState = {
  scrollByChannelKey: Record<string, ChannelScrollState>;
  setScrollTop: (channelKey: string, scrollTop: number) => void;
  reset: () => void;
};

const initialState = {
  scrollByChannelKey: {},
};

export const useMessageScrollStore = create<MessageScrollState>((set) => ({
  ...initialState,
  setScrollTop(channelKey, scrollTop) {
    set((state) => ({
      scrollByChannelKey: {
        ...state.scrollByChannelKey,
        [channelKey]: { scrollTop },
      },
    }));
  },
  reset() {
    set(initialState);
  },
}));

bindStoreToActiveAccount(() => {
  useMessageScrollStore.getState().reset();
});
