import type { Server } from "@runelink/sdk";
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

type DeleteServerDialogProps = {
  server: Server | null;
  onOpenChange: (open: boolean) => void;
  onDeleteServer: (serverId: string, serverHost: string) => Promise<void>;
};

export function DeleteServerDialog({
  server,
  onOpenChange,
  onDeleteServer,
}: DeleteServerDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleConfirm() {
    if (!server) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      await onDeleteServer(server.id, server.host);
      toast.success(`Deleted server: ${server.title}`);
      onOpenChange(false);
    } catch (nextError) {
      toast.error("Failed to delete server.");
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Failed to delete server"
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <AlertDialog
      open={server !== null}
      onOpenChange={(open) => {
        if (!open && !isDeleting) {
          setError(null);
          onOpenChange(false);
        }
      }}
    >
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete server?</AlertDialogTitle>
          <AlertDialogDescription>
            {server
              ? `This permanently deletes ${server.title} and its channels.`
              : "This permanently deletes the selected server and its channels."}
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
            {isDeleting ? "Deleting..." : "Delete server"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
