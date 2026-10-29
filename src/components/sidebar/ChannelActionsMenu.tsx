import { useRef } from "react";
import type { ServerChannel, ServerChannelKind } from "@runelink/sdk";
import { Copy, Ellipsis, FolderPlus, Hash, Pencil, Trash2 } from "lucide-react";
import {
  CopyOtherSubmenu,
  type CopyOption,
} from "@/components/CopyOtherSubmenu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { copyToClipboard } from "@/lib/clipboard";
import { formatChannelCliPath, formatTextChannelCliPath } from "@/lib/cli-path";
import type { useContextActionsMenu } from "@/lib/use-context-actions-menu";
import { cn } from "@/lib/utils";

type ChannelActionsMenuProps = {
  contextMenu?: ReturnType<typeof useContextActionsMenu>;
  host: string;
  channel: ServerChannel;
  canDeleteChannel: boolean;
  onDeleteChannel: (channel: ServerChannel) => void;
  onEditChannel: (channel: ServerChannel) => void;
  // Passed for categories when the user can create channels
  onCreateChild?: (kind: ServerChannelKind) => void;
  className?: string;
  forceVisible?: boolean;
};

function getCopyOptions(host: string, channel: ServerChannel): CopyOption[] {
  const path = formatChannelCliPath(host, channel.id);
  switch (channel.kind) {
    case "text":
      return [
        {
          label: "Raw Text Channel ID",
          value: channel.text_channel_id,
          successLabel: `Copied raw text channel ID: ${channel.text_channel_id}`,
        },
        {
          label: "Path for CLI (Server Channel)",
          value: path,
          successLabel: "Copied CLI path (server channel).",
        },
        {
          label: "Path for CLI (Text Channel)",
          value: formatTextChannelCliPath(host, channel.text_channel_id),
          successLabel: "Copied CLI path (text channel).",
        },
      ];
    case "category":
      return [
        {
          label: "Path for CLI",
          value: path,
          successLabel: "Copied CLI path.",
        },
      ];
  }
}

export function ChannelActionsMenu({
  contextMenu,
  host,
  channel,
  canDeleteChannel,
  onDeleteChannel,
  onEditChannel,
  onCreateChild,
  className,
  forceVisible = false,
}: ChannelActionsMenuProps) {
  const editOnCloseRef = useRef(false);
  const isCategory = channel.kind === "category";
  const idLabel = isCategory ? "category ID" : "channel ID";
  return (
    <>
      <DropdownMenu {...contextMenu?.menuProps}>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className={cn(
                "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-xl text-sidebar-foreground/55 transition",
                forceVisible
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100",
                "hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                className
              )}
              aria-label={`Open ${channel.title} menu`}
            />
          }
        >
          <Ellipsis className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          anchor={contextMenu?.anchor}
          align={contextMenu?.anchor ? "start" : "end"}
          side="bottom"
          sideOffset={contextMenu?.anchor ? 0 : 8}
          className="w-64"
          finalFocus={() => {
            if (!editOnCloseRef.current) return true;
            editOnCloseRef.current = false;
            onEditChannel(channel);
            return false;
          }}
        >
          {onCreateChild ? (
            <>
              <DropdownMenuItem
                className="cursor-pointer gap-3 rounded-xl px-3 py-2"
                onClick={() => {
                  onCreateChild("text");
                }}
              >
                <Hash className="size-4" />
                <span className="font-medium">Create Channel</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer gap-3 rounded-xl px-3 py-2"
                onClick={() => {
                  onCreateChild("category");
                }}
              >
                <FolderPlus className="size-4" />
                <span className="font-medium">Create Category</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}
          {canDeleteChannel ? (
            <DropdownMenuItem
              className="cursor-pointer gap-3 rounded-xl px-3 py-2"
              onClick={() => {
                editOnCloseRef.current = true;
              }}
            >
              <Pencil className="size-4" />
              <span className="font-medium">
                Edit {isCategory ? "Category" : "Channel"}
              </span>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            className="cursor-pointer gap-3 rounded-xl px-3 py-2"
            onClick={() => {
              void copyToClipboard(
                channel.id,
                `Copied ${idLabel}: ${channel.id}`
              );
            }}
          >
            <Copy className="size-4" />
            <span className="font-medium">
              Copy {isCategory ? "Category" : "Channel"} ID
            </span>
          </DropdownMenuItem>
          <CopyOtherSubmenu options={getCopyOptions(host, channel)} />
          <DropdownMenuItem
            variant="destructive"
            disabled={!canDeleteChannel}
            className="cursor-pointer gap-3 rounded-xl px-3 py-2"
            onClick={() => {
              if (!canDeleteChannel) {
                return;
              }

              onDeleteChannel(channel);
            }}
          >
            <Trash2 className="size-4" />
            <span className="font-medium">
              {isCategory ? "Delete Category" : "Delete Channel"}
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
