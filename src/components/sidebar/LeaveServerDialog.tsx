import type { Server } from "@runelink/sdk";
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

type LeaveServerDialogProps = {
  server: Server | null;
  onOpenChange: (open: boolean) => void;
  onLeaveServer: (serverId: string, serverHost: string) => Promise<void>;
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

    try {
      await onLeaveServer(server.id, server.host);
      onOpenChange(false);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Failed to leave server"
      );
    } finally {
      setIsLeaving(false);
    }
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
          <AlertDialogTitle>Leave server?</AlertDialogTitle>
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
            {isLeaving ? "Leaving..." : "Leave server"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
