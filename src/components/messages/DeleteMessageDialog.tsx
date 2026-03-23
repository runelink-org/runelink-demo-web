import type { Message } from "@runelink/sdk";
import { useState } from "react";
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
};

export function DeleteMessageDialog({
  message,
  onOpenChange,
  onDeleteMessage,
}: DeleteMessageDialogProps) {
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
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete message?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the selected message from the channel.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            type="button"
            variant="destructive"
            autoFocus
            disabled={isDeleting}
            onClick={() => {
              void handleConfirm();
            }}
          >
            {isDeleting ? "Deleting..." : "Delete message"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
