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
import type { RequestEffect } from "@/lib/runelink-session";
import * as Effect from "effect/Effect";
import { toastFailure } from "@/lib/toast-failure";
import { runPromise } from "@/lib/runtime";

type LeaveServerDialogProps = {
  server: Server | null;
  onOpenChange: (open: boolean) => void;
  onLeaveServer: (serverId: string, serverHost: string) => RequestEffect<void>;
};

export function LeaveServerDialog({
  server,
  onOpenChange,
  onLeaveServer,
}: LeaveServerDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);

  async function handleConfirm() {
    if (!server) {
      return;
    }

    setIsLeaving(true);
    setError(null);

    await runPromise(
      onLeaveServer(server.id, server.host).pipe(
        Effect.match({
          onSuccess: () => {
            toast.success(`Left server: ${server.title}`);
            onOpenChange(false);
          },
          onFailure: (failure) => {
            setError(toastFailure("Couldn't leave server", failure));
          },
        })
      )
    ).finally(() => {
      setIsLeaving(false);
    });
  }

  return (
    <AlertDialog
      open={server !== null}
      onOpenChange={(open) => {
        if (!open && !isLeaving) {
          setError(null);
          onOpenChange(false);
        }
      }}
    >
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Leave Server?</AlertDialogTitle>
          <AlertDialogDescription>
            {server
              ? `You will leave ${server.title} and remove it from your sidebar.`
              : "You will leave the selected server and remove it from your sidebar."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLeaving}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            type="button"
            variant="destructive"
            disabled={isLeaving}
            onClick={() => {
              void handleConfirm();
            }}
          >
            {isLeaving ? "Leaving..." : "Leave Server"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
