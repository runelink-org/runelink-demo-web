import type { ActiveMessage } from "@runelink/sdk";
import type { TextareaSelection } from "@/lib/textarea-selection";
import { create } from "zustand";
import { bindStoreToActiveAccount } from "@/lib/runelink-store-utils";

export type MessageEditState = {
  session: object;
  message: ActiveMessage;
  body: string;
  selection: TextareaSelection | null;
  isSaving: boolean;
  error: string | null;
};

type ChannelComposerState = {
  focusedInput: "draft" | "edit";
  draft: string;
  selection: TextareaSelection | null;
  replyTo: string | null;
  editing: MessageEditState | null;
  sending: object | null;
  sendError: string | null;
};

export const EMPTY_COMPOSER: ChannelComposerState = {
  focusedInput: "draft",
  draft: "",
  selection: null,
  replyTo: null,
  editing: null,
  sending: null,
  sendError: null,
};

type MessageComposerState = {
  byChannelKey: Record<string, ChannelComposerState>;
  updateChannel: (
    channelKey: string,
    update: (state: ChannelComposerState) => ChannelComposerState
  ) => void;
  updateEdit: (
    channelKey: string,
    session: object,
    patch: Partial<MessageEditState> | null
  ) => void;
  reset: () => void;
};

export const useMessageComposerStore = create<MessageComposerState>(
  (set, get) => ({
    byChannelKey: {},
    updateChannel(channelKey, update) {
      set((state) => {
        const current = state.byChannelKey[channelKey] ?? EMPTY_COMPOSER;
        const next = update(current);
        if (next === current) return state;
        return { byChannelKey: { ...state.byChannelKey, [channelKey]: next } };
      });
    },
    updateEdit(channelKey, session, patch) {
      get().updateChannel(channelKey, (state) => {
        // A completed request must not overwrite a new edit or a new account's state.
        if (state.editing?.session !== session) return state;
        return {
          ...state,
          editing: patch ? { ...state.editing, ...patch } : null,
          focusedInput: patch ? state.focusedInput : "draft",
        };
      });
    },
    reset() {
      set({ byChannelKey: {} });
    },
  })
);

bindStoreToActiveAccount(() => {
  useMessageComposerStore.getState().reset();
});
