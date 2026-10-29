import { cn } from "@/lib/utils";
import type { ServerChannel } from "@runelink/sdk";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { getActiveAccount, useAuthStore } from "@/lib/auth-store";
import { requestExpected } from "@/lib/runelink-request";
import { handleRunelinkUpdate } from "@/lib/runelink-updates";

function selectTitle(input: HTMLInputElement | null) {
  if (!input) return;
  input.focus({ preventScroll: true });
  input.select();
}

export function InlineChannelRename({
  channel,
  host,
  onClose,
  className,
}: {
  channel: ServerChannel;
  host: string;
  onClose: () => void;
  className?: string;
}) {
  const [title, setTitle] = useState(channel.title);
  const [account] = useState(() => getActiveAccount(useAuthStore.getState()));
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const finishedRef = useRef(false);

  useEffect(() => {
    finishedRef.current = false;
    return () => {
      finishedRef.current = true;
    };
  }, []);

  function close() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onClose();
  }

  async function save() {
    if (savingRef.current || finishedRef.current || !account) return;
    const nextTitle = title.trim();
    if (!nextTitle || nextTitle === channel.title) {
      close();
      return;
    }
    const active = getActiveAccount(useAuthStore.getState());
    if (active?.name !== account.name || active?.host !== account.host) {
      toast.error(
        "The active account changed. Cancel and rename again to try again."
      );
      return;
    }
    savingRef.current = true;
    setIsSaving(true);
    try {
      const reply = await requestExpected("channels_update", {
        type: "channels_update",
        data: {
          channel_id: channel.id,
          channel_update: {
            title: nextTitle,
            expected_updated_at: channel.update_version,
          },
          target_host: host === account.host ? null : host,
        },
      });
      const active = getActiveAccount(useAuthStore.getState());
      if (active?.name === account.name && active?.host === account.host)
        handleRunelinkUpdate({ type: "channel_upserted", data: reply.data });
      close();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not rename channel."
      );
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }

  return (
    <Input
      ref={selectTitle}
      aria-label={
        channel.kind === "category" ? "Rename category" : "Rename channel"
      }
      value={title}
      readOnly={isSaving}
      className={cn(
        "h-5 flex-1 select-text rounded-none border-0 bg-transparent p-0 text-sm font-medium shadow-none focus-visible:ring-0 dark:bg-transparent",
        className
      )}
      onChange={(event) => setTitle(event.target.value)}
      onBlur={() => {
        void save();
      }}
      onContextMenu={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          if (!savingRef.current) close();
        } else if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          void save();
        }
      }}
    />
  );
}
