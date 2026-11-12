import { InlineMessageEditor } from "./InlineMessageEditor";
import { cn } from "@/lib/utils";
import { useContextActionsMenu } from "@/lib/use-context-actions-menu";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { formatMessagePreview } from "@/lib/message-preview";
import type { ActiveMessage, Message } from "@runelink/sdk";
import { MessageActionsMenu } from "./MessageActionsMenu";
import type { AppRoute } from "@/lib/app-route";
import { MemberActionsMenu } from "@/components/members/MemberActionsMenu";
import { useMembershipsStore } from "@/lib/memberships-store";
import { sameUserRef } from "@/lib/account-storage";
import type { MouseEvent } from "react";

type MessageListItemProps = {
  host: string;
  channelRoute: Extract<AppRoute, { screen: "channel" }>;
  message: ActiveMessage;
  authorName: string;
  isCompact: boolean;
  leadingMessageOffset: boolean;
  compactTimestamp: string;
  fullTimestamp: string;
  canDeleteMessage: boolean;
  canModerateMembers: boolean;
  editing: ActiveMessage | null;
  onEdit: (message: ActiveMessage | null) => void;
  onCancelEdit: () => void;
  replyTarget: Message | undefined;
  onReply: (message: ActiveMessage) => void;
  onJumpToMessage: (id: string) => void;
  onDeleteMessage: (message: ActiveMessage) => void;
};

export function MessageListItem({
  host,
  channelRoute,
  message,
  authorName,
  isCompact,
  leadingMessageOffset,
  compactTimestamp,
  fullTimestamp,
  canDeleteMessage,
  canModerateMembers,
  editing,
  onEdit,
  onCancelEdit,
  replyTarget,
  onReply,
  onJumpToMessage,
  onDeleteMessage,
}: MessageListItemProps) {
  const contextMenu = useContextActionsMenu();
  const authorContextMenu = useContextActionsMenu();
  const authorRole = useMembershipsStore((state) =>
    message.author
      ? state.membersByServerId[channelRoute.serverId]?.find((member) =>
          sameUserRef(member.user, message.author)
        )?.role
      : undefined
  );
  const isOneLine = !message.body.includes("\n");

  function openAuthorMenu(event: MouseEvent<HTMLButtonElement>) {
    if (!message.author) return;
    event.stopPropagation();
    authorContextMenu.openMenuAbove(event.currentTarget);
  }

  return (
    <div key={message.id} className={leadingMessageOffset ? "mt-3" : ""}>
      <DropdownMenu {...contextMenu.menuProps}>
        <article
          id={`message-${message.id}`}
          tabIndex={-1}
          {...(editing ? {} : contextMenu.targetProps)}
          className={cn(
            "group relative rounded-2xl border border-transparent px-3 py-1.5 pr-9 transition-colors hover:bg-muted",
            editing && "bg-muted pr-3"
          )}
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
          {!editing ? (
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
                channelRoute={channelRoute}
                message={message}
                canDeleteMessage={canDeleteMessage}
                onDeleteMessage={onDeleteMessage}
                onReply={onReply}
                onEdit={onEdit}
              />
            </div>
          ) : null}
          <div className="flex items-start gap-3">
            {isCompact ? (
              <div className="flex w-10 shrink-0 cursor-text select-text items-center justify-end self-stretch whitespace-nowrap text-[10px] text-muted-foreground/90 opacity-0 transition group-hover:opacity-100">
                {compactTimestamp}
              </div>
            ) : null}
            {!isCompact ? (
              <button
                type="button"
                {...(message.author ? authorContextMenu.targetProps : {})}
                onClick={openAuthorMenu}
                disabled={!message.author}
                aria-label={`Open ${authorName} menu`}
                aria-haspopup="menu"
                aria-expanded={authorContextMenu.menuProps.open}
                className="flex size-10 shrink-0 cursor-pointer select-none items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
              >
                {authorName.slice(0, 2).toUpperCase()}
              </button>
            ) : null}
            <div className="min-w-0 flex-1">
              {!isCompact ? (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <button
                    type="button"
                    {...(message.author ? authorContextMenu.targetProps : {})}
                    onClick={openAuthorMenu}
                    disabled={!message.author}
                    aria-haspopup="menu"
                    aria-expanded={authorContextMenu.menuProps.open}
                    className="cursor-pointer font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:no-underline"
                  >
                    {authorName}
                  </button>
                  <span className="cursor-text select-text text-[11px] text-muted-foreground">
                    {fullTimestamp}
                  </span>
                </div>
              ) : null}
              {editing ? (
                <InlineMessageEditor
                  message={editing}
                  host={host}
                  onDelete={() => onDeleteMessage(message)}
                  onClose={(reason) => {
                    onEdit(null);
                    if (reason === "cancel") onCancelEdit();
                  }}
                />
              ) : (
                <p
                  className={`whitespace-pre-wrap break-words text-sm leading-6 text-foreground/90 ${
                    isCompact ? "" : "mt-1"
                  }`}
                >
                  {message.body}
                  {message.edited_at ? (
                    <span
                      className="ml-2 text-xs text-muted-foreground"
                      title={`Edited ${new Date(message.edited_at).toLocaleString()}`}
                    >
                      (edited)
                    </span>
                  ) : null}
                </p>
              )}
            </div>
          </div>
        </article>
      </DropdownMenu>
      {!isCompact && message.author ? (
        <MemberActionsMenu
          contextMenu={authorContextMenu}
          contextOnly
          serverId={channelRoute.serverId}
          serverHost={host}
          user={message.author}
          role={authorRole}
          canModerateMembers={canModerateMembers}
        />
      ) : null}
    </div>
  );
}
