import type { ServerChannel, ServerChannelKind } from "@runelink/sdk";
import { Copy, Ellipsis, FolderPlus, Hash, Trash2 } from "lucide-react";
import { CopyMoreSubmenu, type CopyOption } from "@/components/CopyMoreSubmenu";
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
  // Passed for categories when the user can create channels
  onCreateChild?: (kind: ServerChannelKind) => void;
  className?: string;
  forceVisible?: boolean;
};

function getCopyOptions(host: string, channel: ServerChannel): CopyOption[] {
  const path: CopyOption = {
    label: "Path for CLI",
    value: formatChannelCliPath(host, channel.id),
    successLabel: "Copied CLI path.",
  };
  switch (channel.kind) {
    case "text":
      return [
        {
          label: "Raw text channel ID",
          value: channel.text_channel_id,
          successLabel: `Copied raw text channel ID: ${channel.text_channel_id}`,
        },
        path,
        {
          label: "Raw path for CLI",
          value: formatTextChannelCliPath(host, channel.text_channel_id),
          successLabel: "Copied raw CLI path.",
        },
      ];
    case "category":
      return [path];
  }
}

export function ChannelActionsMenu({
  contextMenu,
  host,
  channel,
  canDeleteChannel,
  onDeleteChannel,
  onCreateChild,
  className,
  forceVisible = false,
}: ChannelActionsMenuProps) {
  const isCategory = channel.kind === "category";
  const idLabel = isCategory ? "category ID" : "channel ID";
  return (
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
              <span className="font-medium">Create channel</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer gap-3 rounded-xl px-3 py-2"
              onClick={() => {
                onCreateChild("category");
              }}
            >
              <FolderPlus className="size-4" />
              <span className="font-medium">Create category</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
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
          <span className="font-medium">Copy {idLabel}</span>
        </DropdownMenuItem>
        <CopyMoreSubmenu options={getCopyOptions(host, channel)} />
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
            {isCategory ? "Delete category" : "Delete channel"}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
