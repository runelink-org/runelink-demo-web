import { useIsMounted } from "@/lib/use-is-mounted";
import type { Host } from "@runelink/sdk";
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
import type { RequestEffect } from "@/lib/runelink-session";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { enteredHost } from "@/lib/account-storage";
import { requestFailureMessage } from "@/lib/request-failure";
import { runPromise } from "@/lib/runtime";

type CreateServerDialogProps = {
  activeHost: Host | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateServer: (
    host: Host,
    title: string,
    description: string
  ) => RequestEffect<void>;
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
    if (!open) return undefined;

    const frame = window.requestAnimationFrame(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [open]);

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextTitle = title.trim();
    if (!host.trim()) {
      setError("Host name is required.");
      return;
    }
    const nextHost = enteredHost(host);
    if (Option.isNone(nextHost)) {
      setError("Enter a host name, such as runelink.chat.");
      return;
    }

    if (!nextTitle) {
      setError("Server name is required.");
      return;
    }

    setIsCreating(true);
    setError(null);

    await runPromise(
      onCreateServer(nextHost.value, nextTitle, description).pipe(
        Effect.match({
          onSuccess: () => {
            if (isMounted()) onOpenChange(false);
          },
          onFailure: (failure) => {
            if (isMounted()) setError(requestFailureMessage(failure));
          },
        })
      )
    ).finally(() => {
      if (isMounted()) setIsCreating(false);
    });
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
    >
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
          onChange={(event) => {
            setHost(event.target.value);
          }}
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
          onChange={(event) => {
            setTitle(event.target.value);
          }}
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
          onChange={(event) => {
            setDescription(event.target.value);
          }}
          placeholder="What kind of conversations happen here?"
          className="min-h-24 resize-none"
          disabled={isCreating}
        />
      </div>

      {error != null && error !== "" ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}

      <AlertDialogFooter>
        <AlertDialogCancel disabled={isCreating}>Cancel</AlertDialogCancel>
        <AlertDialogAction type="submit" disabled={isCreating}>
          {isCreating ? "Creating..." : "Create Server"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </form>
  );
}
