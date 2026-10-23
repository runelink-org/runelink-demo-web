import { useContextActionsMenu } from "@/lib/use-context-actions-menu";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { formatMessagePreview } from "@/lib/message-preview";
import type { ActiveMessage, Message } from "@runelink/sdk";
import { MessageActionsMenu } from "./MessageActionsMenu";

type MessageListItemProps = {
  host: string;
  message: ActiveMessage;
  authorName: string;
  isCompact: boolean;
  leadingMessageOffset: boolean;
  compactTimestamp: string;
  fullTimestamp: string;
  authorJoinedAt: string | null;
  canDeleteMessage: boolean;
  replyTarget: Message | undefined;
  onReply: (message: ActiveMessage) => void;
  onJumpToMessage: (id: string) => void;
  onDeleteMessage: (message: ActiveMessage) => void;
};

export function MessageListItem({
  host,
  message,
  authorName,
  isCompact,
  leadingMessageOffset,
  compactTimestamp,
  fullTimestamp,
  authorJoinedAt,
  canDeleteMessage,
  replyTarget,
  onReply,
  onJumpToMessage,
  onDeleteMessage,
}: MessageListItemProps) {
  const contextMenu = useContextActionsMenu();
  const isOneLine = !message.body.includes("\n");

  return (
    <div key={message.id} className={leadingMessageOffset ? "mt-3" : ""}>
      <DropdownMenu {...contextMenu.menuProps}>
        <article
          id={`message-${message.id}`}
          tabIndex={-1}
          {...contextMenu.targetProps}
          className="group relative rounded-2xl border border-transparent px-3 py-1.5 pr-9 transition-colors hover:bg-muted"
        >
          {message.reply_to ? (
            <div className="relative mb-1 flex h-5 min-w-0 items-center gap-2 pl-[52px] text-xs text-muted-foreground">
              <span
                aria-hidden="true"
                className="absolute bottom-0 left-5 top-2 w-6 rounded-tl-lg border-l-2 border-t-2 border-muted-foreground/35"
              />
              {replyTarget?.deleted_at === null ? (
                <button
                  type="button"
                  className="flex min-w-0 items-center gap-2 text-left hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => onJumpToMessage(replyTarget.id)}
                  aria-label={`Jump to message from ${replyTarget.author?.name ?? "Unknown user"}`}
                >
                  <span
                    className="flex size-4 shrink-0 select-none items-center justify-center rounded-full bg-primary/10 text-[8px] font-semibold text-primary"
                    aria-hidden="true"
                  >
                    {(replyTarget.author?.name ?? "?")
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                  <span className="shrink-0 font-medium">
                    {replyTarget.author?.name ?? "Unknown user"}
                  </span>
                  <span className="truncate">
                    {formatMessagePreview(replyTarget.body)}
                  </span>
                </button>
              ) : (
                <span className="truncate italic">
                  {replyTarget
                    ? "Original message was deleted"
                    : "Original message unavailable"}
                </span>
              )}
            </div>
          ) : null}
          <div
            className={`absolute right-1 z-10 flex w-8 justify-end ${
              isCompact && isOneLine
                ? "inset-y-0 items-center"
                : "top-1.5 h-8 items-start"
            }`}
          >
            <MessageActionsMenu
              anchor={contextMenu.anchor}
              host={host}
              message={message}
              canDeleteMessage={canDeleteMessage}
              onDeleteMessage={onDeleteMessage}
              onReply={onReply}
            />
          </div>
          <div className="flex items-start gap-3">
            {isCompact ? (
              <div className="flex w-10 shrink-0 cursor-text select-text items-center justify-end self-stretch whitespace-nowrap text-[10px] text-muted-foreground/90 opacity-0 transition group-hover:opacity-100">
                {compactTimestamp}
              </div>
            ) : null}
            {!isCompact ? (
              <div className="group/avatar relative shrink-0">
                <div className="flex size-10 cursor-default select-none items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {authorName.slice(0, 2).toUpperCase()}
                </div>
                {message.author ? (
                  <div className="pointer-events-none invisible absolute bottom-full left-9 z-10 mb-1 w-56 rounded-2xl border border-border/70 bg-background p-3 text-left opacity-0 shadow-lg transition duration-150 group-hover/avatar:pointer-events-auto group-hover/avatar:visible group-hover/avatar:opacity-100">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {message.author.name}
                    </p>
                    <div className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                      <p>
                        Host:{" "}
                        <span className="text-foreground/90">
                          @{message.author.host}
                        </span>
                      </p>
                      {authorJoinedAt ? (
                        <p>
                          Joined:{" "}
                          <span className="text-foreground/90">
                            {authorJoinedAt}
                          </span>
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              {!isCompact ? (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium text-foreground">
                    {authorName}
                  </span>
                  <span className="cursor-text select-text text-[11px] text-muted-foreground">
                    {fullTimestamp}
                  </span>
                </div>
              ) : null}
              <p
                className={`whitespace-pre-wrap break-words text-sm leading-6 text-foreground/90 ${
                  isCompact ? "" : "mt-1"
                }`}
              >
                {message.body}
              </p>
            </div>
          </div>
        </article>
      </DropdownMenu>
    </div>
  );
}
