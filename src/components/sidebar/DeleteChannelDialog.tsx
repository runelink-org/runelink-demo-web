import { getState } from "@/lib/atom-registry";
import { authAtom, getActiveAccount } from "@/lib/auth-store";
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
import type { RequestEffect } from "@/lib/runelink-session";
import * as Effect from "effect/Effect";
import { toastFailure } from "@/lib/toast-failure";
import { runPromise } from "@/lib/runtime";

type DeleteChannelDialogProps = {
  channel: ServerChannel | null;
  onOpenChange: (open: boolean) => void;
  onDeleteChannel: (channel: ServerChannel) => RequestEffect<void>;
};

export function DeleteChannelDialog({
  channel,
  onOpenChange,
  onDeleteChannel,
}: DeleteChannelDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const noun = channel?.kind === "category" ? "category" : "channel";
  const nounLabel = channel?.kind === "category" ? "Category" : "Channel";

  async function handleConfirm() {
    if (!channel) {
      return;
    }

    const account = getActiveAccount(getState(authAtom));
    if (!account) {
      setError("Select an account before deleting a channel.");
      return;
    }
    const isCurrentAccount = () =>
      sameUserRef(account, getActiveAccount(getState(authAtom)));
    setIsDeleting(true);
    setError(null);

    await runPromise(
      onDeleteChannel(channel).pipe(
        Effect.match({
          onSuccess: () => {
            if (!isCurrentAccount()) return;
            toast.success(`Deleted ${noun}: ${channel.title}`);
            onOpenChange(false);
          },
          onFailure: (failure) => {
            if (!isCurrentAccount()) return;
            setError(toastFailure(`Couldn't delete ${noun}`, failure));
          },
        })
      )
    ).finally(() => {
      setIsDeleting(false);
    });
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
          <AlertDialogTitle>Delete {nounLabel}?</AlertDialogTitle>
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
            {isDeleting ? "Deleting..." : `Delete ${nounLabel}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
