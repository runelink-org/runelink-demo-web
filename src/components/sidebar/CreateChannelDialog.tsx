import type { ServerChannel, ServerChannelKind } from "@runelink/sdk";
import { FolderPlus, Hash } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { categoryRows } from "@/lib/channel-tree";
import { cn } from "@/lib/utils";

// Select values can't be null, so the server root uses a sentinel
const ROOT_VALUE = "root";

export type CreateChannelRequest = {
  kind: ServerChannelKind;
  parentChannelId: string | null;
};

type CreateChannelDialogProps = {
  request: CreateChannelRequest | null;
  serverTitle: string | null;
  channels: ServerChannel[];
  onOpenChange: (open: boolean) => void;
  onCreateChannel: (
    kind: ServerChannelKind,
    title: string,
    parentChannelId: string | null
  ) => Promise<void>;
};

export function CreateChannelDialog({
  request,
  serverTitle,
  channels,
  onOpenChange,
  onCreateChannel,
}: CreateChannelDialogProps) {
  const [kind, setKind] = useState<ServerChannelKind>("text");
  const [parentValue, setParentValue] = useState(ROOT_VALUE);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const categories = categoryRows(channels);
  const parentItems = [
    { value: ROOT_VALUE, label: "Server root" },
    ...categories.map(({ channel }) => ({
      value: channel.id,
      label: channel.title,
    })),
  ];
  // The chosen parent may have been deleted while the dialog was open
  const parent = parentItems.some((item) => item.value === parentValue)
    ? parentValue
    : ROOT_VALUE;
  const noun = kind === "category" ? "category" : "channel";

  useEffect(() => {
    if (request) {
      setKind(request.kind);
      setParentValue(request.parentChannelId ?? ROOT_VALUE);
    } else {
      setTitle("");
      setError(null);
    }
  }, [request]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextTitle = title.trim();
    if (!nextTitle) {
      setError(
        `${noun === "category" ? "Category" : "Channel"} name is required.`
      );
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      await onCreateChannel(
        kind,
        nextTitle,
        parent === ROOT_VALUE ? null : parent
      );
      onOpenChange(false);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : `Failed to create ${noun}`
      );
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <AlertDialog open={request !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <AlertDialogHeader>
            <AlertDialogTitle>Create {noun}</AlertDialogTitle>
            <AlertDialogDescription>
              {kind === "category"
                ? `Group channels in ${serverTitle ?? "this server"}.`
                : `Add a text channel to ${serverTitle ?? "this server"}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="grid grid-cols-2 gap-2" role="radiogroup">
            {(
              [
                { value: "text", label: "Text channel", Icon: Hash },
                { value: "category", label: "Category", Icon: FolderPlus },
              ] as const
            ).map(({ value, label, Icon }) => (
              <Button
                key={value}
                type="button"
                variant="outline"
                role="radio"
                aria-checked={kind === value}
                className={cn(
                  "justify-start gap-2",
                  kind === value && "border-primary bg-primary/10"
                )}
                disabled={isCreating}
                onClick={() => {
                  setKind(value);
                }}
              >
                <Icon className="size-4" />
                {label}
              </Button>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="channel-title">Name</Label>
            <Input
              id="channel-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={kind === "category" ? "Projects" : "general"}
              disabled={isCreating}
              autoFocus
            />
          </div>

          {categories.length > 0 ? (
            <div className="space-y-2">
              <Label htmlFor="channel-parent">Location</Label>
              <Select
                items={parentItems}
                value={parent}
                onValueChange={(value) => {
                  setParentValue(value ?? ROOT_VALUE);
                }}
                disabled={isCreating}
              >
                <SelectTrigger id="channel-parent" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ROOT_VALUE}>Server root</SelectItem>
                  {categories.map(({ channel, depth }) => (
                    <SelectItem key={channel.id} value={channel.id}>
                      <span style={{ paddingLeft: depth * 12 }}>
                        {channel.title}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCreating}>Cancel</AlertDialogCancel>
            <AlertDialogAction type="submit" disabled={isCreating}>
              {isCreating ? "Creating..." : `Create ${noun}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
