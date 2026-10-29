import type { ActiveMessage } from "@runelink/sdk";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getActiveAccount, useAuthStore } from "@/lib/auth-store";
import { requestExpected } from "@/lib/runelink-request";
import { handleRunelinkUpdate } from "@/lib/runelink-updates";

function focusAtEnd(input: HTMLTextAreaElement | null) {
  if (!input) return;
  input.focus({ preventScroll: true });
  input.setSelectionRange(input.value.length, input.value.length);
}

export function InlineMessageEditor({
  message,
  host,
  onClose,
  onDelete,
}: {
  message: ActiveMessage;
  host: string;
  onClose: (reason: "cancel" | "saved") => void;
  onDelete: () => void;
}) {
  const [body, setBody] = useState(message.body);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [account] = useState(() => getActiveAccount(useAuthStore.getState()));

  async function save() {
    if (!account || isSaving) return;
    const active = getActiveAccount(useAuthStore.getState());
    if (active?.name !== account.name || active?.host !== account.host) {
      setError(
        "The active account changed. Cancel and reopen the editor to try again."
      );
      return;
    }
    if (!body.trim()) {
      onDelete();
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const reply = await requestExpected("messages_update", {
        type: "messages_update",
        data: {
          message_id: message.id,
          message_update: { body, expected_updated_at: message.update_version },
          target_host: host === account.host ? null : host,
        },
      });
      const active = getActiveAccount(useAuthStore.getState());
      if (active?.name === account.name && active?.host === account.host) {
        handleRunelinkUpdate({ type: "message_upserted", data: reply.data });
      }
      onClose("saved");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not save changes."
      );
    } finally {
      setIsSaving(false);
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
        ref={focusAtEnd}
        aria-label="Edit message"
        value={body}
        rows={1}
        disabled={isSaving}
        className="min-h-0 max-h-80 resize-none bg-background px-3 py-3 text-sm leading-6 focus-visible:border-input focus-visible:ring-0 disabled:bg-background dark:bg-background dark:disabled:bg-background"
        onChange={(event) => setBody(event.target.value)}
        onContextMenu={(event) => event.stopPropagation()}
        onTouchStart={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            if (!isSaving) onClose("cancel");
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
          onClick={() => onClose("cancel")}
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
