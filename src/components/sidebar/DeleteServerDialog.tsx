import { resourceKey } from "@runelink/sdk";
import type { ResourceRef, Server } from "@runelink/sdk";
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
import type { RequestEffect } from "@/lib/runelink-session";
import * as Effect from "effect/Effect";
import { toastFailure } from "@/lib/toast-failure";
import { runPromise } from "@/lib/runtime";

type DeleteServerDialogProps = {
  server: Server | null;
  onOpenChange: (open: boolean) => void;
  onDeleteServer: (server: ResourceRef) => RequestEffect<void>;
};

function normalizeWhitespace(value: string): string {
  return value.trim().replaceAll(/\s+/gu, " ");
}

export function DeleteServerDialog({
  server,
  onOpenChange,
  onDeleteServer,
}: DeleteServerDialogProps) {
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const serverKey = server ? resourceKey(server) : null;
  const [shownServerKey, setShownServerKey] = useState(serverKey);
  // Start fresh for each server, even when the parent closes the dialog.
  if (shownServerKey !== serverKey) {
    setShownServerKey(serverKey);
    setConfirmation("");
    setError(null);
  }
  // Titles may contain whitespace that can't be typed into one line.
  const phrase = server ? normalizeWhitespace(`delete ${server.title}`) : "";
  const isConfirmed =
    Boolean(server) && normalizeWhitespace(confirmation) === phrase;

  async function handleConfirm() {
    if (!server || !isConfirmed || isDeleting) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    await runPromise(
      onDeleteServer(server).pipe(
        Effect.match({
          onSuccess: () => {
            toast.success(`Deleted server: ${server.title}`);
            onOpenChange(false);
          },
          onFailure: (failure) => {
            setError(toastFailure("Couldn't delete server", failure));
          },
        })
      )
    ).finally(() => {
      setIsDeleting(false);
    });
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

        {error != null && error !== "" ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}

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
