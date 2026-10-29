import type { ServerChannel } from "@runelink/sdk";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DeleteChannelDialog } from "@/components/sidebar/DeleteChannelDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getActiveAccount, useAuthStore } from "@/lib/auth-store";
import { requestExpected } from "@/lib/runelink-request";
import { handleRunelinkUpdate } from "@/lib/runelink-updates";

type ChannelSettingsPageProps = {
  channel: ServerChannel | null;
  host: string | null;
  canManage: boolean;
  isLoading: boolean;
  onDone: () => void;
  onDeleteChannel: (channel: ServerChannel) => Promise<void>;
};

export function ChannelSettingsPage({
  channel,
  host,
  canManage,
  isLoading,
  onDone,
  onDeleteChannel,
}: ChannelSettingsPageProps) {
  const noun = channel?.kind === "category" ? "Category" : "Channel";
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="border-b border-border/70 bg-background/80 px-4 py-4 backdrop-blur sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="-ml-2 size-9 shrink-0 rounded-full"
            onClick={onDone}
            aria-label="Back from channel settings"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <h1 className="min-w-0 truncate text-xl font-semibold text-foreground">
            <span className="font-medium text-muted-foreground">
              {noun} settings
            </span>
            {channel ? (
              <>
                <span className="px-2 text-muted-foreground">/</span>
                <span>{channel.title}</span>
              </>
            ) : null}
          </h1>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto bg-background px-4 py-5 sm:px-6">
        {channel && host ? (
          <ChannelSettingsForm
            channel={channel}
            host={host}
            canManage={canManage}
            onDeleteChannel={onDeleteChannel}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-md rounded-3xl border border-border/70 bg-background/80 p-6 text-center shadow-sm">
              <h2 className="text-lg font-semibold">
                {isLoading
                  ? "Loading channel settings..."
                  : "Channel unavailable"}
              </h2>
              {!isLoading ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  The selected channel or category could not be found.
                </p>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function ChannelSettingsForm({
  channel,
  host,
  canManage,
  onDeleteChannel,
}: {
  channel: ServerChannel;
  host: string;
  canManage: boolean;
  onDeleteChannel: (channel: ServerChannel) => Promise<void>;
}) {
  const [baseline, setBaseline] = useState(channel);
  const [title, setTitle] = useState(channel.title);
  const [description, setDescription] = useState(channel.description ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [account] = useState(() => getActiveAccount(useAuthStore.getState()));
  const mountedRef = useRef(false);
  const noun = channel.kind === "category" ? "category" : "channel";
  const label = channel.kind === "category" ? "Category" : "Channel";
  const dirty =
    title.trim() !== baseline.title ||
    description !== (baseline.description ?? "");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function reset() {
    setBaseline(channel);
    setTitle(channel.title);
    setDescription(channel.description ?? "");
    setError(null);
    setSaved(false);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!account || !canManage || isSaving || !dirty || !title.trim()) return;
    const active = getActiveAccount(useAuthStore.getState());
    if (active?.name !== account.name || active?.host !== account.host) {
      setError("The active account changed. Reopen settings to try again.");
      return;
    }
    setIsSaving(true);
    setSaved(false);
    setError(null);
    try {
      const reply = await requestExpected("channels_update", {
        type: "channels_update",
        data: {
          channel_id: channel.id,
          channel_update: {
            title: title.trim(),
            description: description || null,
            expected_updated_at: baseline.update_version,
          },
          target_host: host === account.host ? null : host,
        },
      });
      const active = getActiveAccount(useAuthStore.getState());
      if (active?.name !== account.name || active?.host !== account.host)
        return;
      handleRunelinkUpdate({ type: "channel_upserted", data: reply.data });
      if (!mountedRef.current) return;
      setBaseline(reply.data);
      setTitle(reply.data.title);
      setDescription(reply.data.description ?? "");
      setSaved(true);
    } catch (error) {
      if (mountedRef.current)
        setError(
          error instanceof Error
            ? error.message
            : `Could not save ${noun} settings.`
        );
    } finally {
      if (mountedRef.current) setIsSaving(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <section>
        <h2 className="text-base font-semibold text-foreground">Overview</h2>
        <form className="mt-5 space-y-6" onSubmit={save}>
          <div className="space-y-2">
            <Label htmlFor="channel-title">{label} title</Label>
            <Input
              id="channel-title"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setSaved(false);
              }}
              disabled={!canManage || isSaving}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="channel-description">{label} description</Label>
            <Textarea
              id="channel-description"
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                setSaved(false);
              }}
              rows={6}
              className="min-h-40 resize-y field-sizing-fixed"
              disabled={!canManage || isSaving}
            />
          </div>
          {!canManage ? (
            <p className="text-sm text-muted-foreground">
              Only server admins can edit {noun} settings.
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error} Your changes have been kept. Reset to load the latest
              values.
            </p>
          ) : null}
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              disabled={!canManage || isSaving || !dirty || !title.trim()}
            >
              {isSaving ? "Saving..." : "Save changes"}
            </Button>
            {dirty || error ? (
              <Button
                type="button"
                variant="outline"
                disabled={isSaving}
                onClick={reset}
              >
                Reset
              </Button>
            ) : null}
            {saved ? (
              <p role="status" className="text-sm text-muted-foreground">
                Changes saved.
              </p>
            ) : null}
          </div>
        </form>
      </section>
      <section>
        <h2 className="text-base font-semibold text-destructive">
          Danger zone
        </h2>
        <div className="mt-5 overflow-hidden rounded-2xl border border-destructive/20 bg-destructive/5">
          <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
            <p className="text-sm font-medium text-destructive">
              Delete {noun}
            </p>
            <Button
              type="button"
              variant="destructive"
              className="shrink-0"
              disabled={!canManage || isSaving}
              onClick={() => setIsDeleteOpen(true)}
            >
              <Trash2 className="size-4" />
              Delete {noun}
            </Button>
          </div>
        </div>
      </section>
      <DeleteChannelDialog
        channel={isDeleteOpen ? channel : null}
        onOpenChange={setIsDeleteOpen}
        onDeleteChannel={onDeleteChannel}
      />
    </div>
  );
}
