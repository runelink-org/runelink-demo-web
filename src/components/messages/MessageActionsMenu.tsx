import { getActiveAccount, useAuthStore } from "@/lib/auth-store";
import type { ActiveMessage } from "@runelink/sdk";
import { useRef, type ComponentProps } from "react";
import { Copy, Ellipsis, Pencil, Reply, Trash2 } from "lucide-react";
import { CopyOtherSubmenu } from "@/components/CopyOtherSubmenu";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { copyToClipboard } from "@/lib/clipboard";
import { formatMessageCliPath } from "@/lib/cli-path";
import { cn } from "@/lib/utils";

type MessageActionsMenuProps = {
  anchor?: ComponentProps<typeof DropdownMenuContent>["anchor"];
  host: string;
  message: ActiveMessage;
  canDeleteMessage: boolean;
  onReply: (message: ActiveMessage) => void;
  onEdit: (message: ActiveMessage) => void;
  onDeleteMessage: (message: ActiveMessage) => void;
};

export function MessageActionsMenu({
  anchor,
  host,
  message,
  canDeleteMessage,
  onReply,
  onEdit,
  onDeleteMessage,
}: MessageActionsMenuProps) {
  const activeAccount = useAuthStore(getActiveAccount);
  const canEdit =
    !!message.author &&
    message.author.name === activeAccount?.name &&
    message.author.host === activeAccount?.host;
  const actionOnCloseRef = useRef<"reply" | "edit" | "delete" | null>(null);

  return (
    <>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-xl text-muted-foreground/55 transition",
              "opacity-0 group-hover:opacity-100",
              "hover:bg-background hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            )}
            aria-label="Open message menu"
          />
        }
      >
        <Ellipsis className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        anchor={anchor}
        align={anchor ? "start" : "end"}
        side="bottom"
        sideOffset={anchor ? 0 : 8}
        className="w-52"
        finalFocus={() => {
          const action = actionOnCloseRef.current;
          actionOnCloseRef.current = null;
          if (action === "edit") onEdit(message);
          else if (action === "reply") onReply(message);
          else if (action === "delete") onDeleteMessage(message);
          return action === null;
        }}
      >
        {canEdit ? (
          <DropdownMenuItem
            className="cursor-pointer gap-3 rounded-xl px-3 py-2"
            onClick={() => {
              actionOnCloseRef.current = "edit";
            }}
          >
            <Pencil className="size-4" />
            <span className="font-medium">Edit Message</span>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          className="cursor-pointer gap-3 rounded-xl px-3 py-2"
          onClick={() => {
            actionOnCloseRef.current = "reply";
          }}
        >
          <Reply className="size-4" />
          <span className="font-medium">Reply</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer gap-3 rounded-xl px-3 py-2"
          onClick={() => {
            void copyToClipboard(message.body, "Copied message text.");
          }}
        >
          <Copy className="size-4" />
          <span className="font-medium">Copy Text</span>
        </DropdownMenuItem>
        <CopyOtherSubmenu
          options={[
            {
              label: "Message ID",
              value: message.id,
              successLabel: `Copied message ID: ${message.id}`,
            },
            {
              label: "Path for CLI",
              value: formatMessageCliPath(host, message.id),
              successLabel: "Copied CLI path.",
            },
          ]}
        />
        <DropdownMenuItem
          variant="destructive"
          disabled={!canDeleteMessage}
          className="cursor-pointer gap-3 rounded-xl px-3 py-2"
          onClick={() => {
            if (!canDeleteMessage) {
              return;
            }

            actionOnCloseRef.current = "delete";
          }}
        >
          <Trash2 className="size-4" />
          <span className="font-medium">Delete Message</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </>
  );
}
