import { useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CreateChannelDialogProps = {
  open: boolean;
  serverTitle: string | null;
  onOpenChange: (open: boolean) => void;
  onCreateChannel: (title: string, description: string) => Promise<void>;
};

export function CreateChannelDialog({
  open,
  serverTitle,
  onOpenChange,
  onCreateChannel,
}: CreateChannelDialogProps) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!open) {
      setTitle("");
      setError(null);
    }
  }, [open]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextTitle = title.trim();
    if (!nextTitle) {
      setError("Channel name is required.");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const description = "";
      await onCreateChannel(nextTitle, description);
      onOpenChange(false);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Failed to create channel"
      );
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
          setError(null);
        }
      }}
    >
      <AlertDialogContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <AlertDialogHeader>
            <AlertDialogTitle>Create channel</AlertDialogTitle>
            <AlertDialogDescription>
              Add a text channel to {serverTitle ?? "this server"}.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <Label htmlFor="channel-title">Name</Label>
            <Input
              id="channel-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="general"
              disabled={isCreating}
              autoFocus
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCreating}>Cancel</AlertDialogCancel>
            <AlertDialogAction type="submit" disabled={isCreating}>
              {isCreating ? "Creating..." : "Create channel"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
