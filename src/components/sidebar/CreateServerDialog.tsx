import { useIsMounted } from "@/lib/use-is-mounted";
import { useEffect, useRef, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";

type CreateServerDialogProps = {
  activeHost: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateServer: (
    host: string,
    title: string,
    description: string
  ) => Promise<void>;
};

export function CreateServerDialog(props: CreateServerDialogProps) {
  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialogContent>
        <CreateServerDialogForm
          key={`${props.open}:${props.activeHost}`}
          {...props}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}

function CreateServerDialogForm({
  activeHost,
  open,
  onOpenChange,
  onCreateServer,
}: CreateServerDialogProps) {
  const isMounted = useIsMounted();
  const [host, setHost] = useState(activeHost ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [open]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextHost = host.trim();
    const nextTitle = title.trim();
    if (!nextHost) {
      setError("Host name is required.");
      return;
    }

    if (!nextTitle) {
      setError("Server name is required.");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      await onCreateServer(nextHost, nextTitle, description);
      if (isMounted()) onOpenChange(false);
    } catch (nextError) {
      if (!isMounted()) return;
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Failed to create server"
      );
    } finally {
      if (isMounted()) setIsCreating(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <AlertDialogHeader>
        <AlertDialogTitle>Create Server</AlertDialogTitle>
        <AlertDialogDescription>
          Start a new server that other users can join.
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div className="space-y-2">
        <Label htmlFor="server-host">Host</Label>
        <Input
          id="server-host"
          value={host}
          onChange={(event) => setHost(event.target.value)}
          placeholder="runelink.chat"
          disabled={isCreating}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="server-title">Name</Label>
        <Input
          id="server-title"
          ref={titleInputRef}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Game Night"
          disabled={isCreating}
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="server-description">Description</Label>
        <Textarea
          id="server-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What kind of conversations happen here?"
          className="min-h-24 resize-none"
          disabled={isCreating}
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <AlertDialogFooter>
        <AlertDialogCancel disabled={isCreating}>Cancel</AlertDialogCancel>
        <AlertDialogAction type="submit" disabled={isCreating}>
          {isCreating ? "Creating..." : "Create Server"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </form>
  );
}
