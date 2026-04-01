import type { ServerMember, ServerRole } from "@runelink/sdk";
import { Copy, Ellipsis, Shield, ShieldOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type MemberActionsMenuProps = {
  member: ServerMember;
  canKickMembers: boolean;
  canManageMemberRoles: boolean;
  onKickMember: (member: ServerMember) => void;
  onUpdateMemberRole: (member: ServerMember, role: ServerRole) => void;
};

function formatUserId(user: { name: string; host: string }): string {
  return `${user.name}@${user.host}`;
}

export function MemberActionsMenu({
  member,
  canKickMembers,
  canManageMemberRoles,
  onKickMember,
  onUpdateMemberRole,
}: MemberActionsMenuProps) {
  async function handleCopyUserId() {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      toast.error("Clipboard is not available.");
      return;
    }

    const userId = formatUserId(member.user);

    try {
      await navigator.clipboard.writeText(userId);
      toast.success(`Copied user ID: ${userId}`);
    } catch {
      toast.error("Failed to copy user ID.");
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex size-8 shrink-0 items-center justify-center rounded-xl text-muted-foreground/55 transition hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            aria-label={`Open ${member.user.name} menu`}
          />
        }
      >
        <Ellipsis className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="bottom"
        sideOffset={8}
        className="w-56"
      >
        <DropdownMenuItem
          className="cursor-pointer gap-3 rounded-xl px-3 py-2"
          onClick={() => {
            void handleCopyUserId();
          }}
        >
          <Copy className="size-4" />
          <span className="font-medium">Copy user ID</span>
        </DropdownMenuItem>
        {canManageMemberRoles ? (
          <DropdownMenuItem
            className="cursor-pointer gap-3 rounded-xl px-3 py-2"
            onClick={() => {
              onUpdateMemberRole(
                member,
                member.role === "admin" ? "member" : "admin"
              );
            }}
          >
            {member.role === "admin" ? (
              <ShieldOff className="size-4" />
            ) : (
              <Shield className="size-4" />
            )}
            <span className="font-medium">
              {member.role === "admin" ? "Remove admin" : "Promote to admin"}
            </span>
          </DropdownMenuItem>
        ) : null}
        {canKickMembers ? (
          <DropdownMenuItem
            variant="destructive"
            className="cursor-pointer gap-3 rounded-xl px-3 py-2"
            onClick={() => {
              onKickMember(member);
            }}
          >
            <Trash2 className="size-4" />
            <span className="font-medium">Kick member</span>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
