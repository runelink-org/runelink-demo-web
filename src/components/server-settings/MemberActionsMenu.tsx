import type { ServerMember, ServerRole } from "@runelink/sdk";
import { Copy, Ellipsis, Shield, ShieldOff, Trash2 } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getActiveAccount, useAuthStore } from "@/lib/auth-store";
import { useMembershipsStore } from "@/lib/memberships-store";

type MemberActionsMenuProps = {
  serverId: string;
  serverHost: string;
  member: ServerMember;
  canKickMembers: boolean;
  canManageMemberRoles: boolean;
};

function getTargetHost(serverHost: string, activeHost: string): string | null {
  return serverHost === activeHost ? null : serverHost;
}

function formatUserId(user: { name: string; host: string }): string {
  return `${user.name}@${user.host}`;
}

export function MemberActionsMenu({
  serverId,
  serverHost,
  member,
  canKickMembers,
  canManageMemberRoles,
}: MemberActionsMenuProps) {
  const activeAccount = useAuthStore(getActiveAccount);
  const [isConfirmingSelfDemotion, setIsConfirmingSelfDemotion] =
    useState(false);
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const upsertMembership = useMembershipsStore(
    (state) => state.upsertMembership
  );
  const deleteMembership = useMembershipsStore(
    (state) => state.deleteMembership
  );

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

  async function handleUpdateMemberRole(role: ServerRole) {
    setIsUpdatingRole(true);

    try {
      await upsertMembership(serverId, {
        user_ref: member.user,
        server_id: serverId,
        server_host: serverHost,
        role,
      });
      toast.success(
        role === "admin"
          ? `Promoted ${member.user.name} to admin.`
          : `Removed admin from ${member.user.name}.`
      );
      setIsConfirmingSelfDemotion(false);
    } catch (error) {
      toast.error(
        role === "admin"
          ? `Failed to promote ${member.user.name} to admin.`
          : `Failed to remove admin from ${member.user.name}.`
      );
      throw error;
    } finally {
      setIsUpdatingRole(false);
    }
  }

  async function handleKickMember() {
    if (!activeAccount) {
      return;
    }

    try {
      await deleteMembership(
        serverId,
        member.user,
        getTargetHost(serverHost, activeAccount.host)
      );
      toast.success(`Kicked ${member.user.name} from the server.`);
    } catch (error) {
      toast.error(`Failed to kick ${member.user.name}.`);
      throw error;
    }
  }

  const isActiveAccount =
    activeAccount?.name === member.user.name &&
    activeAccount.host === member.user.host;
  const isSelfDemotion = isActiveAccount && member.role === "admin";

  return (
    <>
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
              variant={member.role === "admin" ? "destructive" : "default"}
              className="cursor-pointer gap-3 rounded-xl px-3 py-2"
              onClick={() => {
                if (isSelfDemotion) {
                  setIsConfirmingSelfDemotion(true);
                  return;
                }

                void handleUpdateMemberRole(
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
                void handleKickMember();
              }}
            >
              <Trash2 className="size-4" />
              <span className="font-medium">Kick member</span>
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={isConfirmingSelfDemotion}
        onOpenChange={(open) => {
          if (!isUpdatingRole) {
            setIsConfirmingSelfDemotion(open);
          }
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove your admin role?</AlertDialogTitle>
            <AlertDialogDescription>
              You will lose access to member management for this server after
              demoting yourself.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUpdatingRole}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              variant="destructive"
              disabled={isUpdatingRole}
              onClick={() => {
                void handleUpdateMemberRole("member");
              }}
            >
              {isUpdatingRole ? "Removing..." : "Remove admin"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
