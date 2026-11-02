import { padHost, type UserRef } from "@runelink/sdk";
import { useState } from "react";
import { toast } from "sonner";
import { TypedConfirmationField } from "@/components/TypedConfirmationField";
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
import { forgetDeletedAccount } from "@/lib/account-deletion";
import { accountStorageKey, sameUserRef } from "@/lib/account-storage";
import { isSavedAccount } from "@/lib/auth-store";
import {
  requestRunelink,
  useRunelinkConnectionStore,
} from "@/lib/runelink-connection-store";

type DeleteAccountDialogProps = {
  account: UserRef | null;
  onOpenChange: (open: boolean) => void;
};

export function DeleteAccountDialog({
  account,
  onOpenChange,
}: DeleteAccountDialogProps) {
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [shownAccount, setShownAccount] = useState(account);
  // Start fresh for each account, even when the parent closes the dialog.
  if (!sameUserRef(shownAccount, account)) {
    setShownAccount(account);
    setConfirmation("");
    setError(null);
  }
  // Deletion is sent over the account's connection, so wait for it rather
  // than queueing a request that could hang while the host is unreachable.
  const isConnected = useRunelinkConnectionStore(
    (state) =>
      state.status === "connected" &&
      sameUserRef(state.connectedAccount, account)
  );
  const name = account ? accountStorageKey(account) : "";
  const typed = confirmation.trim();
  // Both default-port spellings are accepted, matching the CLI.
  const isConfirmed =
    !!account &&
    (typed === `delete ${name}` ||
      typed === `delete ${account.name}@${padHost(account.host)}`);

  async function handleConfirm() {
    if (!account || !isConfirmed || !isConnected || isDeleting) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    try {
      const reply = await requestRunelink({
        type: "users_delete",
        data: { user_ref: account },
      });
      if (reply.type !== "users_delete") {
        throw new Error(`Unexpected reply type: ${reply.type}`);
      }
      forgetDeletedAccount(account);
      onOpenChange(false);
    } catch (nextError) {
      // The host's user_deleted update can lead to the account being removed
      // before the reply arrives, tearing down the connection and failing the
      // request even though the deletion succeeded.
      if (!isSavedAccount(account)) {
        return;
      }
      toast.error("Failed to delete account.");
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Failed to delete account"
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <AlertDialog
      open={account !== null}
      onOpenChange={(open) => {
        if (!open && !isDeleting) {
          onOpenChange(false);
        }
      }}
    >
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Account?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes{" "}
            <span className="font-semibold">{name}</span> on its home host and
            removes it from that host's servers. Its messages stay, without an
            author.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {account ? (
          <TypedConfirmationField
            phrase={`delete ${name}`}
            value={confirmation}
            disabled={isDeleting}
            onChange={setConfirmation}
            onSubmit={() => {
              void handleConfirm();
            }}
          />
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            type="button"
            variant="destructive"
            disabled={!isConfirmed || !isConnected || isDeleting}
            onClick={() => {
              void handleConfirm();
            }}
          >
            {isDeleting
              ? "Deleting..."
              : isConnected
                ? "Delete Account"
                : "Connecting..."}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
