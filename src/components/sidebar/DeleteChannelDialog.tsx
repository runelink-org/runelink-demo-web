import { getAuthSessionSnapshot } from "@/lib/auth-session-bridge";
import { sameUserRef } from "@/lib/account-storage";
import type { ServerChannel } from "@runelink/sdk";
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

type DeleteChannelDialogProps = {
  channel: ServerChannel | null;
  onOpenChange: (open: boolean) => void;
  onDeleteChannel: (channel: ServerChannel) => Promise<void>;
};

export function DeleteChannelDialog({
  channel,
  onOpenChange,
  onDeleteChannel,
}: DeleteChannelDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const noun = channel?.kind === "category" ? "category" : "channel";

  async function handleConfirm() {
    if (!channel) {
      return;
    }

    const account = getAuthSessionSnapshot().activeAccount;
    if (!account) {
      setError("Select an account before deleting a channel.");
      return;
    }
    const isCurrentAccount = () =>
      sameUserRef(account, getAuthSessionSnapshot().activeAccount);
    setIsDeleting(true);
    setError(null);

    try {
      await onDeleteChannel(channel);
      if (!isCurrentAccount()) return;
      toast.success(`Deleted ${noun}: ${channel.title}`);
      onOpenChange(false);
    } catch (nextError) {
      if (!isCurrentAccount()) return;
      toast.error(`Failed to delete ${noun}.`);
      setError(
        nextError instanceof Error
          ? nextError.message
          : `Failed to delete ${noun}`
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
          <AlertDialogTitle>Delete {noun}?</AlertDialogTitle>
          <AlertDialogDescription>
            {channel?.kind === "category"
              ? `This will remove the ${channel.title} category. Only empty categories can be deleted.`
              : channel
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
            {isDeleting ? "Deleting..." : `Delete ${noun}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
