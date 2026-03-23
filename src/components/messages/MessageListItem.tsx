import type { Message } from "@runelink/sdk";
import { MessageActionsMenu } from "./MessageActionsMenu";

type MessageListItemProps = {
  message: Message;
  authorName: string;
  isCompact: boolean;
  leadingMessageOffset: boolean;
  compactTimestamp: string;
  fullTimestamp: string;
  authorJoinedAt: string | null;
  canDeleteMessage: boolean;
  onDeleteMessage: (message: Message) => void;
};

export function MessageListItem({
  message,
  authorName,
  isCompact,
  leadingMessageOffset,
  compactTimestamp,
  fullTimestamp,
  authorJoinedAt,
  canDeleteMessage,
  onDeleteMessage,
}: MessageListItemProps) {
  return (
    <div key={message.id} className={leadingMessageOffset ? "mt-3" : ""}>
      <article className="group relative rounded-2xl border border-transparent px-3 py-1.5 pr-10 transition hover:border-border/70 hover:bg-background/80 focus-within:border-border/70 focus-within:bg-background/80">
        <div className="absolute top-1.5 right-1.5 z-10 flex h-8 w-8 items-start justify-end">
          <MessageActionsMenu
            message={message}
            canDeleteMessage={canDeleteMessage}
            onDeleteMessage={onDeleteMessage}
          />
        </div>
        <div className="flex items-start gap-3">
          {isCompact ? (
            <div className="flex w-10 shrink-0 cursor-default select-none items-center justify-end self-stretch whitespace-nowrap text-[10px] text-muted-foreground/90 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
              {compactTimestamp}
            </div>
          ) : null}
          {!isCompact ? (
            <div className="group/avatar relative shrink-0">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-sm font-semibold text-primary">
                {authorName.slice(0, 2).toUpperCase()}
              </div>
              {message.author ? (
                <div className="pointer-events-none absolute bottom-full left-9 z-10 mb-1 w-56 rounded-2xl border border-border/70 bg-background p-3 text-left opacity-0 shadow-lg transition duration-150 group-hover/avatar:pointer-events-auto group-hover/avatar:opacity-100">
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
                <span className="cursor-default select-none text-[11px] text-muted-foreground">
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
    </div>
  );
}
