import type { Server } from "@runelink/sdk";
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

type DeleteServerDialogProps = {
  server: Server | null;
  onOpenChange: (open: boolean) => void;
  onDeleteServer: (serverId: string, serverHost: string) => Promise<void>;
};

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function DeleteServerDialog({
  server,
  onOpenChange,
  onDeleteServer,
}: DeleteServerDialogProps) {
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [shownServerId, setShownServerId] = useState(server?.id);
  // Start fresh for each server, even when the parent closes the dialog.
  if (shownServerId !== server?.id) {
    setShownServerId(server?.id);
    setConfirmation("");
    setError(null);
  }
  // Titles may contain whitespace that can't be typed into one line.
  const phrase = server ? normalizeWhitespace(`delete ${server.title}`) : "";
  const isConfirmed = !!server && normalizeWhitespace(confirmation) === phrase;

  async function handleConfirm() {
    if (!server || !isConfirmed || isDeleting) {
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
          onOpenChange(false);
        }
      }}
    >
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Server?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes this server, including all of its channels
            and messages, for every member.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {server ? (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Title</dt>
              <dd className="font-semibold wrap-anywhere">{server.title}</dd>
              <dt className="text-muted-foreground">ID</dt>
              <dd className="font-mono text-xs leading-5 wrap-anywhere">
                {server.id}
              </dd>
              <dt className="text-muted-foreground">Host</dt>
              <dd className="wrap-anywhere">{server.host}</dd>
            </dl>
            <TypedConfirmationField
              phrase={phrase}
              value={confirmation}
              disabled={isDeleting}
              onChange={setConfirmation}
              onSubmit={() => {
                void handleConfirm();
              }}
            />
          </>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            type="button"
            variant="destructive"
            disabled={!isConfirmed || isDeleting}
            onClick={() => {
              void handleConfirm();
            }}
          >
            {isDeleting ? "Deleting..." : "Delete Server"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
