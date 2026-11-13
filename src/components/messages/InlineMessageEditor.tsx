import {
  readTextareaSelection,
  restoreTextareaSelection,
  sameTextareaSelection,
} from "@/lib/textarea-selection";
import type { ActiveMessage } from "@runelink/sdk";
import { useCallback, useState } from "react";
import { useMessageComposerStore } from "@/lib/message-composer-store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getActiveAccount, useAuthStore } from "@/lib/auth-store";
import { requestExpected } from "@/lib/runelink-request";
import { handleRunelinkUpdate } from "@/lib/runelink-updates";

export function InlineMessageEditor({
  message,
  channelKey,
  host,
  onClose,
  onDelete,
}: {
  message: ActiveMessage;
  channelKey: string;
  host: string;
  onClose: (reason: "cancel" | "saved") => void;
  onDelete: () => void;
}) {
  const editing = useMessageComposerStore(
    (state) => state.byChannelKey[channelKey]?.editing
  );
  const updateEdit = useMessageComposerStore((state) => state.updateEdit);
  const session = editing?.session;
  const body = editing?.body ?? message.body;
  const error = editing?.error ?? null;
  const isSaving = editing?.isSaving ?? false;

  const restoreInput = useCallback(
    (input: HTMLTextAreaElement | null) => {
      if (!input) return;
      const saved = useMessageComposerStore.getState().byChannelKey[channelKey];
      if (saved?.editing?.session !== session) return;
      restoreTextareaSelection(input, saved?.editing?.selection ?? null);
      if (saved?.focusedInput === "edit") input.focus({ preventScroll: true });
    },
    [channelKey, session]
  );

  function updateBody(input: HTMLTextAreaElement) {
    if (!session) return;
    const selection = readTextareaSelection(input);
    if (
      body === input.value &&
      sameTextareaSelection(editing?.selection ?? null, selection)
    )
      return;
    updateEdit(channelKey, session, { body: input.value, selection });
  }

  function close(reason: "cancel" | "saved") {
    if (!session) return;
    updateEdit(channelKey, session, null);
    onClose(reason);
  }
  const [account] = useState(() => getActiveAccount(useAuthStore.getState()));

  async function save() {
    if (!account || !session || isSaving) return;
    const active = getActiveAccount(useAuthStore.getState());
    if (active?.name !== account.name || active?.host !== account.host) {
      updateEdit(channelKey, session, {
        error:
          "The active account changed. Cancel and reopen the editor to try again.",
      });
      return;
    }
    if (!body.trim()) {
      onDelete();
      return;
    }
    updateEdit(channelKey, session, { isSaving: true, error: null });
    try {
      const reply = await requestExpected("messages_update", {
        type: "messages_update",
        data: {
          message_id: message.id,
          message_update: { body, expected_updated_at: message.updated_at },
          target_host: host === account.host ? null : host,
        },
      });
      const active = getActiveAccount(useAuthStore.getState());
      if (active?.name === account.name && active?.host === account.host) {
        handleRunelinkUpdate({ type: "message_upserted", data: reply.data });
      }
      close("saved");
    } catch (error) {
      updateEdit(channelKey, session, {
        error:
          error instanceof Error ? error.message : "Could not save changes.",
      });
    } finally {
      updateEdit(channelKey, session, { isSaving: false });
    }
  }

  return (
    <form
      className="mt-1 space-y-1.5 pb-1"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Textarea
        ref={restoreInput}
        aria-label="Edit message"
        value={body}
        rows={1}
        disabled={isSaving}
        className="min-h-0 max-h-80 resize-none bg-background px-3 py-3 text-sm leading-6 focus-visible:border-input focus-visible:ring-0 disabled:bg-background dark:bg-background dark:disabled:bg-background"
        onFocus={() => {
          useMessageComposerStore
            .getState()
            .updateChannel(channelKey, (state) =>
              state.editing?.session !== session ||
              state.focusedInput === "edit"
                ? state
                : { ...state, focusedInput: "edit" }
            );
        }}
        onChange={(event) => updateBody(event.currentTarget)}
        onSelect={(event) => updateBody(event.currentTarget)}
        onContextMenu={(event) => event.stopPropagation()}
        onTouchStart={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            if (!isSaving) close("cancel");
          } else if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void save();
          }
        }}
      />
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error} Your draft has been kept. Cancel and reopen the editor to load
          the latest version.
        </p>
      ) : null}
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <span>escape to</span>
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 text-xs"
          disabled={isSaving}
          onClick={() => close("cancel")}
        >
          cancel
        </Button>
        <span aria-hidden="true">•</span>
        <span>enter to</span>
        <Button
          type="submit"
          variant="link"
          className="h-auto p-0 text-xs"
          disabled={isSaving}
        >
          {isSaving ? "saving..." : "save"}
        </Button>
      </div>
    </form>
  );
}
