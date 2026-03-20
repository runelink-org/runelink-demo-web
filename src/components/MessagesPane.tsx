import type { Message, ServerWithChannels } from "@runelink/sdk";
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { Hash, MessagesSquare, SendHorizonal, ServerCrash } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type MessagesPaneProps = {
  selectedServer: ServerWithChannels | null;
  selectedChannel: ServerWithChannels["channels"][number] | undefined;
  selectedMessages: Message[];
  isSidebarLoading: boolean;
  sidebarError: string | null;
  hydratedServerCount: number;
  isMessagesLoading: boolean;
  messagesError: string | null;
  onSendMessage: (body: string) => Promise<void>;
};

function formatMessageTimestamp(value: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(value);
}

function MessageList({ messages }: { messages: Message[] }) {
  return (
    <div className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 py-5 sm:px-6">
      {messages.map((message) => {
        const authorName = message.author?.name ?? "Unknown user";
        const authorHost = message.author?.host ?? "remote";

        return (
          <article
            key={message.id}
            className="group rounded-2xl border border-transparent px-3 py-3 transition hover:border-border/70 hover:bg-background/80"
          >
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-sm font-semibold text-primary">
                {authorName.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium text-foreground">
                    {authorName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    @{authorHost}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatMessageTimestamp(message.created_at)}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground/90">
                  {message.body}
                </p>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function MessagesPane({
  selectedServer,
  selectedChannel,
  selectedMessages,
  isSidebarLoading,
  sidebarError,
  hydratedServerCount,
  isMessagesLoading,
  messagesError,
  onSendMessage,
}: MessagesPaneProps) {
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const canCompose = !!selectedServer && !!selectedChannel && !sidebarError;
  const isSendDisabled = !canCompose || isSending || draft.trim().length === 0;

  useEffect(() => {
    if (!sendError) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSendError(null);
    }, 4000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [sendError]);

  useEffect(() => {
    if (!canCompose || isSending) {
      return;
    }

    textareaRef.current?.focus();
  }, [canCompose, isSending, selectedChannel?.id, selectedServer?.server.id]);

  async function handleSubmit() {
    const nextBody = draft.trim();

    if (!nextBody || !canCompose) {
      return;
    }

    setIsSending(true);
    setSendError(null);

    try {
      await onSendMessage(nextBody);
      setDraft("");
    } catch (error) {
      setSendError(
        error instanceof Error ? error.message : "Failed to send message"
      );
    } finally {
      setIsSending(false);
    }
  }

  async function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    await handleSubmit();
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void handleSubmit();
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="border-b border-border/70 bg-background/80 px-4 py-4 backdrop-blur sm:px-6">
        {selectedServer && selectedChannel ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MessagesSquare className="size-4" />
                <span className="truncate">{selectedServer.server.title}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <Hash className="size-5 text-muted-foreground" />
                <h1 className="truncate text-xl font-semibold text-foreground">
                  {selectedChannel.title}
                </h1>
              </div>
              {selectedChannel.description ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedChannel.description}
                </p>
              ) : null}
            </div>

            <Badge
              variant="outline"
              className="self-start rounded-full px-3 py-1"
            >
              {selectedMessages.length} message
              {selectedMessages.length === 1 ? "" : "s"}
            </Badge>
          </div>
        ) : (
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Choose a channel
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Select a server and channel to open the conversation.
            </p>
          </div>
        )}
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-background)_92%,transparent),color-mix(in_oklab,var(--color-muted)_35%,white))]">
        {sidebarError ? (
          <div className="flex flex-1 items-center justify-center px-6">
            <div className="max-w-md rounded-3xl border border-destructive/20 bg-destructive/5 p-6 text-center">
              <ServerCrash className="mx-auto size-10 text-destructive" />
              <h2 className="mt-4 text-lg font-semibold">
                Unable to load your servers
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {sidebarError}
              </p>
            </div>
          </div>
        ) : isSidebarLoading ? (
          <div className="flex flex-1 items-center justify-center px-6">
            <div className="rounded-3xl border border-border/70 bg-background/80 px-6 py-5 text-center shadow-sm backdrop-blur">
              <p className="text-sm font-medium text-foreground">
                Loading your servers...
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Fetching channels and getting your workspace ready.
              </p>
            </div>
          </div>
        ) : hydratedServerCount === 0 ? (
          <div className="flex flex-1 items-center justify-center px-6">
            <div className="max-w-md rounded-3xl border border-border/70 bg-background/80 p-6 text-center shadow-sm backdrop-blur">
              <h2 className="text-lg font-semibold">No servers yet</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Join or create a server to start browsing channels and messages.
              </p>
            </div>
          </div>
        ) : !selectedServer || !selectedChannel ? (
          <div className="flex flex-1 items-center justify-center px-6">
            <div className="max-w-md rounded-3xl border border-border/70 bg-background/80 p-6 text-center shadow-sm backdrop-blur">
              <h2 className="text-lg font-semibold">No channel selected</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Pick a channel in the sidebar to load its conversation.
              </p>
            </div>
          </div>
        ) : messagesError ? (
          <div className="flex flex-1 items-center justify-center px-6">
            <div className="max-w-md rounded-3xl border border-destructive/20 bg-destructive/5 p-6 text-center">
              <h2 className="text-lg font-semibold">Unable to load messages</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {messagesError}
              </p>
            </div>
          </div>
        ) : isMessagesLoading && selectedMessages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-6">
            <div className="rounded-3xl border border-border/70 bg-background/80 px-6 py-5 text-center shadow-sm backdrop-blur">
              <p className="text-sm font-medium text-foreground">
                Loading #{selectedChannel.title}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Pulling the latest messages from the channel.
              </p>
            </div>
          </div>
        ) : selectedMessages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-6">
            <div className="max-w-md rounded-3xl border border-border/70 bg-background/80 p-6 text-center shadow-sm backdrop-blur">
              <h2 className="text-lg font-semibold">No messages yet</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                This channel is quiet right now. Once someone posts, messages
                will appear here.
              </p>
            </div>
          </div>
        ) : (
          <MessageList messages={selectedMessages} />
        )}

        {canCompose ? (
          <div className="border-t border-border/70 bg-background/85 px-4 py-4 backdrop-blur sm:px-6">
            <form
              className="rounded-3xl border border-border/70 bg-background/95 p-3 shadow-sm"
              onSubmit={handleFormSubmit}
            >
              <Textarea
                ref={textareaRef}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                }}
                onKeyDown={(event) => {
                  void handleKeyDown(event);
                }}
                placeholder={`Message #${selectedChannel.title}`}
                className="min-h-20 resize-none border-0 bg-transparent px-1 py-1 shadow-none focus-visible:ring-0"
                disabled={isSending}
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Enter to send, Shift+Enter for a new line.
                </p>
                <Button type="submit" size="sm" disabled={isSendDisabled}>
                  <SendHorizonal className="size-4" />
                  {isSending ? "Sending..." : "Send"}
                </Button>
              </div>
            </form>
          </div>
        ) : null}

        {sendError ? (
          <div className="pointer-events-none absolute bottom-24 right-4 z-10 sm:right-6">
            <div className="pointer-events-auto max-w-sm rounded-2xl border border-destructive/25 bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
              <p className="text-sm font-semibold text-destructive">
                Unable to send message
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{sendError}</p>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
