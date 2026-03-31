import type { Message, ServerWithChannels, UserRef } from "@runelink/sdk";
import {
  useCallback,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { ArrowLeft, Hash, SendHorizonal, ServerCrash } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChannelActionsMenu } from "@/components/sidebar/ChannelActionsMenu";
import { Textarea } from "@/components/ui/textarea";
import { sameUserRef } from "@/lib/account-storage";
import { useMessageScrollStore } from "@/lib/message-scroll-store";
import { DeleteMessageDialog } from "./messages/DeleteMessageDialog";
import { MessageListItem } from "./messages/MessageListItem";

type MessagesPaneProps = {
  selectedServer: ServerWithChannels | null;
  selectedChannel: ServerWithChannels["channels"][number] | undefined;
  selectedChannelKey: string | null;
  selectedMessages: Message[];
  isSidebarLoading: boolean;
  sidebarError: string | null;
  hydratedServerCount: number;
  isMessagesLoading: boolean;
  messagesError: string | null;
  activeAccount: UserRef | null;
  canModerateMessages: boolean;
  canDeleteChannel: boolean;
  onDeselectChannel: () => void;
  onSendMessage: (body: string) => Promise<void>;
  onDeleteChannel: (
    channel: ServerWithChannels["channels"][number]
  ) => Promise<void>;
  onDeleteMessage: (message: Message) => Promise<void>;
};

function formatMessageTimestamp(value: Date): string {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  const startOfTargetDay = new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate()
  );
  const dayDifference = Math.round(
    (startOfToday.getTime() - startOfTargetDay.getTime()) / 86400000
  );

  const timeLabel = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(value);

  if (dayDifference === 0) {
    return timeLabel;
  }

  if (dayDifference === 1) {
    return `Yesterday at ${timeLabel}`;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function formatFullTimestamp(value: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function formatCompactTimestamp(value: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

const COMPACT_MESSAGE_WINDOW_MS = 5 * 60 * 1000;

function shouldCompactMessage(current: Message, previous?: Message): boolean {
  if (!previous) {
    return false;
  }

  if (!current.author || !previous.author) {
    return false;
  }

  if (
    current.author.name !== previous.author.name ||
    current.author.host !== previous.author.host
  ) {
    return false;
  }

  return (
    current.created_at.getTime() - previous.created_at.getTime() <=
    COMPACT_MESSAGE_WINDOW_MS
  );
}

function MessageList({
  host,
  serverId,
  channelId,
  messages,
  scrollContainerRef,
  onScroll,
  activeAccount,
  canModerateMessages,
  onDeleteMessage,
}: {
  host: string;
  serverId: string;
  channelId: string;
  messages: Message[];
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  activeAccount: UserRef | null;
  canModerateMessages: boolean;
  onDeleteMessage: (message: Message) => Promise<void>;
}) {
  const [messagePendingDelete, setMessagePendingDelete] =
    useState<Message | null>(null);

  return (
    <>
      <div
        ref={scrollContainerRef}
        onScroll={onScroll}
        className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 py-5 sm:px-6"
      >
        {messages.map((message, index) => {
          const authorName = message.author?.name ?? "Unknown user";
          const isCompact = shouldCompactMessage(message, messages[index - 1]);
          const leadingMessageOffset = !isCompact && index > 0;
          const canDeleteMessage =
            canModerateMessages ||
            (!!activeAccount &&
              !!message.author &&
              sameUserRef(activeAccount, message.author));

          return (
            <MessageListItem
              key={message.id}
              host={host}
              serverId={serverId}
              channelId={channelId}
              message={message}
              authorName={authorName}
              isCompact={isCompact}
              leadingMessageOffset={leadingMessageOffset}
              compactTimestamp={formatCompactTimestamp(message.created_at)}
              fullTimestamp={formatMessageTimestamp(message.created_at)}
              authorJoinedAt={
                message.author
                  ? formatFullTimestamp(message.author.created_at)
                  : null
              }
              canDeleteMessage={canDeleteMessage}
              onDeleteMessage={(nextMessage) => {
                setMessagePendingDelete(nextMessage);
              }}
            />
          );
        })}
      </div>
      <DeleteMessageDialog
        message={messagePendingDelete}
        onOpenChange={(open) => {
          if (!open) {
            setMessagePendingDelete(null);
          }
        }}
        onDeleteMessage={onDeleteMessage}
      />
    </>
  );
}

export function MessagesPane({
  selectedServer,
  selectedChannel,
  selectedChannelKey,
  selectedMessages,
  isSidebarLoading,
  sidebarError,
  hydratedServerCount,
  isMessagesLoading,
  messagesError,
  activeAccount,
  canModerateMessages,
  canDeleteChannel,
  onDeselectChannel,
  onSendMessage,
  onDeleteChannel,
  onDeleteMessage,
}: MessagesPaneProps) {
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const hasRestoredScrollRef = useRef(false);
  const previousChannelKeyRef = useRef<string | null>(null);
  const previousMessageCountRef = useRef(0);
  const wasAtBottomRef = useRef(true);
  const lastKnownScrollTopRef = useRef(0);
  const scrollByChannelKey = useMessageScrollStore(
    (state) => state.scrollByChannelKey
  );
  const setScrollTop = useMessageScrollStore((state) => state.setScrollTop);

  const canCompose = !!selectedServer && !!selectedChannel && !sidebarError;
  const isSendDisabled = !canCompose || isSending || draft.trim().length === 0;

  const isAtBottom = useCallback((element: HTMLDivElement): boolean => {
    const threshold = 32;
    return (
      element.scrollHeight - element.clientHeight - element.scrollTop <=
      threshold
    );
  }, []);

  const scrollToBottom = useCallback(() => {
    const element = scrollContainerRef.current;
    if (!element) {
      return;
    }

    element.scrollTop = element.scrollHeight;
  }, []);

  const saveScrollPosition = useCallback(
    (channelKey: string | null, scrollTop?: number) => {
      if (!channelKey) {
        return;
      }

      const nextScrollTop = scrollTop ?? scrollContainerRef.current?.scrollTop;
      if (nextScrollTop == null) {
        return;
      }

      lastKnownScrollTopRef.current = nextScrollTop;
      setScrollTop(channelKey, nextScrollTop);
    },
    [setScrollTop]
  );

  const saveCurrentScrollPosition = useCallback(() => {
    if (!selectedChannelKey) {
      return;
    }

    saveScrollPosition(selectedChannelKey);
  }, [saveScrollPosition, selectedChannelKey]);

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

    if (
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 639px)").matches
    ) {
      return;
    }

    textareaRef.current?.focus();
  }, [canCompose, isSending, selectedChannel?.id, selectedServer?.server.id]);

  useLayoutEffect(() => {
    if (previousChannelKeyRef.current === selectedChannelKey) {
      return;
    }

    previousChannelKeyRef.current = selectedChannelKey;
    hasRestoredScrollRef.current = false;
    previousMessageCountRef.current = selectedMessages.length;
    wasAtBottomRef.current = true;
  }, [selectedChannelKey, selectedMessages.length]);

  useLayoutEffect(() => {
    return () => {
      saveScrollPosition(
        previousChannelKeyRef.current,
        lastKnownScrollTopRef.current
      );
    };
  }, [saveScrollPosition, selectedChannelKey]);

  useLayoutEffect(() => {
    if (
      !selectedChannelKey ||
      isMessagesLoading ||
      hasRestoredScrollRef.current
    ) {
      return;
    }

    const element = scrollContainerRef.current;
    if (!element) {
      return;
    }

    const savedScrollState = scrollByChannelKey[selectedChannelKey];
    if (savedScrollState) {
      element.scrollTop = savedScrollState.scrollTop;
    } else {
      scrollToBottom();
    }

    lastKnownScrollTopRef.current = element.scrollTop;
    wasAtBottomRef.current = isAtBottom(element);
    saveCurrentScrollPosition();
    hasRestoredScrollRef.current = true;
  }, [
    isAtBottom,
    isMessagesLoading,
    saveCurrentScrollPosition,
    scrollToBottom,
    scrollByChannelKey,
    selectedChannelKey,
    selectedMessages.length,
  ]);

  useLayoutEffect(() => {
    if (!selectedChannelKey || !hasRestoredScrollRef.current) {
      previousMessageCountRef.current = selectedMessages.length;
      return;
    }

    const element = scrollContainerRef.current;
    if (!element) {
      previousMessageCountRef.current = selectedMessages.length;
      return;
    }

    const previousMessageCount = previousMessageCountRef.current;
    const nextMessageCount = selectedMessages.length;

    if (nextMessageCount > previousMessageCount && wasAtBottomRef.current) {
      scrollToBottom();
    }

    lastKnownScrollTopRef.current = element.scrollTop;
    wasAtBottomRef.current = isAtBottom(element);
    saveCurrentScrollPosition();
    previousMessageCountRef.current = nextMessageCount;
  }, [
    isAtBottom,
    saveCurrentScrollPosition,
    scrollToBottom,
    selectedChannelKey,
    selectedMessages,
  ]);

  function handleMessagesScroll() {
    if (!selectedChannelKey) {
      return;
    }

    const element = scrollContainerRef.current;
    if (!element) {
      return;
    }

    lastKnownScrollTopRef.current = element.scrollTop;
    wasAtBottomRef.current = isAtBottom(element);
    saveCurrentScrollPosition();
  }

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
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="-ml-2 size-9 shrink-0 rounded-full sm:hidden"
                    onClick={onDeselectChannel}
                    aria-label="Back to channels"
                  >
                    <ArrowLeft className="size-4" />
                  </Button>
                  <Hash className="size-5 shrink-0 text-muted-foreground" />
                  <h1 className="truncate text-xl font-semibold text-foreground">
                    {selectedChannel.title}
                  </h1>
                </div>
              </div>

              <div className="shrink-0 sm:hidden">
                <ChannelActionsMenu
                  host={selectedServer.server.host}
                  serverId={selectedServer.server.id}
                  channel={selectedChannel}
                  canDeleteChannel={canDeleteChannel}
                  forceVisible
                  onDeleteChannel={(channel) => {
                    void onDeleteChannel(channel);
                  }}
                />
              </div>
            </div>

            <Badge
              variant="outline"
              className="hidden self-start rounded-full px-3 py-1 sm:inline-flex"
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
          <MessageList
            host={selectedServer.server.host}
            serverId={selectedServer.server.id}
            channelId={selectedChannel.id}
            messages={selectedMessages}
            scrollContainerRef={scrollContainerRef}
            onScroll={handleMessagesScroll}
            activeAccount={activeAccount}
            canModerateMessages={canModerateMessages}
            onDeleteMessage={onDeleteMessage}
          />
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
