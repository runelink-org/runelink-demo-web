import type { ActiveMessage } from "@runelink/sdk";
import type { TextareaSelection } from "@/lib/textarea-selection";
import { appAtomRegistry, stateAtom } from "@/lib/atom-registry";
import { bindStoreToActiveAccount } from "@/lib/runelink-store-utils";

type MessageEditState = {
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

// Composer state by channel key
export const messageComposerAtom = stateAtom<
  Record<string, ChannelComposerState>
>({});

export function getComposer(channelKey: string): ChannelComposerState {
  return appAtomRegistry.get(messageComposerAtom)[channelKey] ?? EMPTY_COMPOSER;
}

export function updateComposer(
  channelKey: string,
  update: (state: ChannelComposerState) => ChannelComposerState
): void {
  appAtomRegistry.update(messageComposerAtom, (byChannelKey) => {
    const current = byChannelKey[channelKey] ?? EMPTY_COMPOSER;
    const next = update(current);
    if (next === current) return byChannelKey;
    return { ...byChannelKey, [channelKey]: next };
  });
}

export function updateEdit(
  channelKey: string,
  session: object,
  patch: Partial<MessageEditState> | null
): void {
  updateComposer(channelKey, (state) => {
    // A completed request must not overwrite a new edit or a new account's state.
    if (state.editing?.session !== session) return state;
    return {
      ...state,
      editing: patch ? { ...state.editing, ...patch } : null,
      focusedInput: patch ? state.focusedInput : "draft",
    };
  });
}

bindStoreToActiveAccount(() => {
  appAtomRegistry.set(messageComposerAtom, {});
});
