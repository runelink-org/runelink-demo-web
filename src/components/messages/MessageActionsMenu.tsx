import type { Message } from "@runelink/sdk";
import { Copy, Ellipsis, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type MessageActionsMenuProps = {
  message: Message;
  canDeleteMessage: boolean;
  onDeleteMessage: (message: Message) => void;
};

export function MessageActionsMenu({
  message,
  canDeleteMessage,
  onDeleteMessage,
}: MessageActionsMenuProps) {
  async function copyToClipboard(value: string, successLabel: string) {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      toast.error("Clipboard is not available.");
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      toast.success(successLabel);
    } catch {
      toast.error("Failed to copy.");
    }
  }

  return (
    <DropdownMenu>
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
        align="end"
        side="bottom"
        sideOffset={8}
        className="w-52"
      >
        <DropdownMenuItem
          className="cursor-pointer gap-3 rounded-xl px-3 py-2"
          onClick={() => {
            void copyToClipboard(message.body, "Copied message text.");
          }}
        >
          <Copy className="size-4" />
          <span className="font-medium">Copy text</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer gap-3 rounded-xl px-3 py-2"
          onClick={() => {
            void copyToClipboard(
              message.id,
              `Copied message ID: ${message.id}`
            );
          }}
        >
          <Copy className="size-4" />
          <span className="font-medium">Copy message ID</span>
        </DropdownMenuItem>
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
    </DropdownMenu>
  );
}
