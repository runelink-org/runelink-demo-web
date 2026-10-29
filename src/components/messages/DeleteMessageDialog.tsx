import type { Message } from "@runelink/sdk";
import { useRef, useState, type RefObject } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type DeleteMessageDialogProps = {
  message: Message | null;
  onOpenChange: (open: boolean) => void;
  onDeleteMessage: (message: Message) => Promise<void>;
  composerRef: RefObject<HTMLTextAreaElement | null>;
};

export function DeleteMessageDialog({
  message,
  onOpenChange,
  onDeleteMessage,
  composerRef,
}: DeleteMessageDialogProps) {
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const deletedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleConfirm() {
    if (!message) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      await onDeleteMessage(message);
      deletedRef.current = true;
      toast.success("Deleted message.");
      onOpenChange(false);
    } catch (nextError) {
      toast.error("Failed to delete message.");
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Failed to delete message"
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <AlertDialog
      open={message !== null}
      onOpenChange={(open) => {
        if (!open && !isDeleting) {
          setError(null);
          onOpenChange(false);
        }
      }}
    >
      <AlertDialogContent
        size="sm"
        initialFocus={deleteButtonRef}
        finalFocus={() => {
          if (!deletedRef.current) return true;
          deletedRef.current = false;
          return composerRef.current;
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Message?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently clears the message text. Replies to it will show
            that the original message was deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            type="button"
            variant="destructive"
            ref={deleteButtonRef}
            disabled={isDeleting}
            onClick={() => {
              void handleConfirm();
            }}
          >
            {isDeleting ? "Deleting..." : "Delete Message"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
