import type { ServerRole, UserRef } from "@runelink/sdk";
import { Ellipsis, Shield, ShieldOff, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { IdIcon } from "@/components/icons/IdIcon";
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
import type { useContextActionsMenu } from "@/lib/use-context-actions-menu";

type MemberActionsMenuProps = {
  contextMenu?: ReturnType<typeof useContextActionsMenu>;
  contextOnly?: boolean;
  serverId: string;
  serverHost: string;
  user: UserRef;
  role?: ServerRole;
  canModerateMembers: boolean;
};

function getTargetHost(serverHost: string, activeHost: string): string | null {
  return serverHost === activeHost ? null : serverHost;
}

function formatUserId(user: { name: string; host: string }): string {
  return `${user.name}@${user.host}`;
}

export function MemberActionsMenu({
  contextMenu,
  contextOnly = false,
  serverId,
  serverHost,
  user,
  role,
  canModerateMembers,
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

    const userId = formatUserId(user);

    try {
      await navigator.clipboard.writeText(userId);
      toast.success(`Copied user ID: ${userId}`);
    } catch {
      toast.error("Failed to copy user ID.");
    }
  }

  async function handleUpdateMemberRole(nextRole: ServerRole) {
    if (!canModerateMembers || !role) return;
    setIsUpdatingRole(true);

    try {
      await upsertMembership(serverId, {
        user_ref: user,
        server_id: serverId,
        server_host: serverHost,
        role: nextRole,
      });
      toast.success(
        nextRole === "admin"
          ? `Promoted ${user.name} to admin.`
          : `Removed admin from ${user.name}.`
      );
      setIsConfirmingSelfDemotion(false);
    } catch (error) {
      toast.error(
        nextRole === "admin"
          ? `Failed to promote ${user.name} to admin.`
          : `Failed to remove admin from ${user.name}.`
      );
      throw error;
    } finally {
      setIsUpdatingRole(false);
    }
  }

  async function handleKickMember() {
    if (!activeAccount || !canModerateMembers || !role || isActiveAccount) {
      return;
    }

    try {
      await deleteMembership(
        serverId,
        user,
        getTargetHost(serverHost, activeAccount.host)
      );
      toast.success(`Kicked ${user.name} from the server.`);
    } catch (error) {
      toast.error(`Failed to kick ${user.name}.`);
      throw error;
    }
  }

  const isActiveAccount =
    activeAccount?.name === user.name && activeAccount.host === user.host;
  const isSelfDemotion = isActiveAccount && role === "admin";

  return (
    <>
      <DropdownMenu {...contextMenu?.menuProps}>
        {contextOnly ? null : (
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-xl text-muted-foreground/55 transition hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                aria-label={`Open ${user.name} menu`}
              />
            }
          >
            <Ellipsis className="size-4" />
          </DropdownMenuTrigger>
        )}
        <DropdownMenuContent
          anchor={contextMenu?.anchor}
          align={contextMenu?.anchor ? "start" : "end"}
          side={contextMenu?.side ?? "bottom"}
          sideOffset={contextMenu?.anchor ? 0 : 8}
          className="w-56"
        >
          <DropdownMenuItem
            className="cursor-pointer gap-3 rounded-xl px-3 py-2"
            onClick={() => {
              void handleCopyUserId();
            }}
          >
            <IdIcon className="size-4" />
            <span className="font-medium">Copy User ID</span>
          </DropdownMenuItem>
          {canModerateMembers && role ? (
            <DropdownMenuItem
              variant={role === "admin" ? "destructive" : "default"}
              className="cursor-pointer gap-3 rounded-xl px-3 py-2"
              onClick={() => {
                if (isSelfDemotion) {
                  setIsConfirmingSelfDemotion(true);
                  return;
                }

                void handleUpdateMemberRole(
                  role === "admin" ? "member" : "admin"
                );
              }}
            >
              {role === "admin" ? (
                <ShieldOff className="size-4" />
              ) : (
                <Shield className="size-4" />
              )}
              <span className="font-medium">
                {role === "admin" ? "Remove Admin" : "Promote to Admin"}
              </span>
            </DropdownMenuItem>
          ) : null}
          {canModerateMembers && role && !isActiveAccount ? (
            <DropdownMenuItem
              variant="destructive"
              className="cursor-pointer gap-3 rounded-xl px-3 py-2"
              onClick={() => {
                void handleKickMember();
              }}
            >
              <Trash2 className="size-4" />
              <span className="font-medium">Kick Member</span>
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
            <AlertDialogTitle>Remove Your Admin Role?</AlertDialogTitle>
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
              {isUpdatingRole ? "Removing..." : "Remove Admin"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
