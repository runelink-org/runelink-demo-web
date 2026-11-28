import { resourceKey } from "@runelink/sdk";
import type { ActiveMessage, ResourceKey, ResourceRef } from "@runelink/sdk";
import * as Rec from "effect/Record";
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
  Record<ResourceKey, ChannelComposerState>
>({});

export function getComposer(channelKey: ResourceKey): ChannelComposerState {
  return appAtomRegistry.get(messageComposerAtom)[channelKey] ?? EMPTY_COMPOSER;
}

export function updateComposer(
  channelKey: ResourceKey,
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
  channelKey: ResourceKey,
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

// Closes the edit of a message, and returns whether one was open.
export function closeMessageEdit(message: ResourceRef): boolean {
  const byChannelKey = appAtomRegistry.get(messageComposerAtom);
  const key = resourceKey(message);
  for (const [channelKey, { editing }] of Rec.toEntries(byChannelKey)) {
    if (editing != null && resourceKey(editing.message) === key) {
      updateEdit(channelKey, editing.session, null);
      return true;
    }
  }
  return false;
}

bindStoreToActiveAccount(() => {
  appAtomRegistry.set(messageComposerAtom, {});
});
