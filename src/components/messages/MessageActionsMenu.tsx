import type { ActiveMessage } from "@runelink/sdk";
import { useRef, type ComponentProps } from "react";
import { Copy, Ellipsis, Reply, Trash2 } from "lucide-react";
import { CopyMoreSubmenu } from "@/components/CopyMoreSubmenu";
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
  onDeleteMessage: (message: ActiveMessage) => void;
};

export function MessageActionsMenu({
  anchor,
  host,
  message,
  canDeleteMessage,
  onReply,
  onDeleteMessage,
}: MessageActionsMenuProps) {
  const replyOnCloseRef = useRef(false);

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
          if (!replyOnCloseRef.current) return true;
          replyOnCloseRef.current = false;
          onReply(message);
          return false;
        }}
      >
        <DropdownMenuItem
          className="cursor-pointer gap-3 rounded-xl px-3 py-2"
          onClick={() => {
            replyOnCloseRef.current = true;
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
          <span className="font-medium">Copy text</span>
        </DropdownMenuItem>
        <CopyMoreSubmenu
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

            onDeleteMessage(message);
          }}
        >
          <Trash2 className="size-4" />
          <span className="font-medium">Delete message</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </>
  );
}
