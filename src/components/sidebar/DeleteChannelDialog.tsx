import type { Channel } from "@runelink/sdk";
import { useState } from "react";
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

type DeleteChannelDialogProps = {
  channel: Channel | null;
  onOpenChange: (open: boolean) => void;
  onDeleteChannel: (channel: Channel) => Promise<void>;
};

export function DeleteChannelDialog({
  channel,
  onOpenChange,
  onDeleteChannel,
}: DeleteChannelDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleConfirm() {
    if (!channel) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      await onDeleteChannel(channel);
      onOpenChange(false);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Failed to delete channel"
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <AlertDialog
      open={channel !== null}
      onOpenChange={(open) => {
        if (!open && !isDeleting) {
          setError(null);
          onOpenChange(false);
        }
      }}
    >
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete channel?</AlertDialogTitle>
          <AlertDialogDescription>
            {channel
              ? `This will remove #${channel.title} from the server.`
              : "This will remove the selected channel from the server."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            type="button"
            variant="destructive"
            disabled={isDeleting}
            onClick={() => {
              void handleConfirm();
            }}
          >
            {isDeleting ? "Deleting..." : "Delete channel"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
