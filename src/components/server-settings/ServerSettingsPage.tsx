import type {
  ServerMember,
  ServerRole,
  ServerWithChannels,
} from "@runelink/sdk";
import {
  ArrowLeft,
  CircleDashed,
  Copy,
  Ellipsis,
  Shield,
  ShieldOff,
  Trash2,
  Users,
} from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getActiveAccount, useAuthStore } from "@/lib/auth-store";
import { userRefKey } from "@/lib/runelink-store-utils";
import { useUsersStore } from "@/lib/users-store";

type ServerSettingsPageProps = {
  server: ServerWithChannels | null;
  members: ServerMember[];
  isLoadingMembers: boolean;
  membersError: string | null;
  onKickMember: (member: ServerMember) => void;
  onUpdateMemberRole: (member: ServerMember, role: ServerRole) => void;
  onDone: () => void;
};

type MemberActionsMenuProps = {
  member: ServerMember;
  canKickMembers: boolean;
  canManageMemberRoles: boolean;
  onKickMember: (member: ServerMember) => void;
  onUpdateMemberRole: (member: ServerMember, role: ServerRole) => void;
};

function formatServerTimestamp(value: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function formatRoleLabel(role: ServerMember["role"]): string {
  return role === "admin" ? "Admin" : "Member";
}

function formatUserId(user: { name: string; host: string }): string {
  return `${user.name}@${user.host}`;
}

function MemberActionsMenu({
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

export function ServerSettingsPage({
  server,
  members,
  isLoadingMembers,
  membersError,
  onKickMember,
  onUpdateMemberRole,
  onDone,
}: ServerSettingsPageProps) {
  const activeAccount = useAuthStore(getActiveAccount);
  const activeUser = useUsersStore((state) =>
    activeAccount
      ? (state.userByRefKey[userRefKey(activeAccount)] ?? null)
      : null
  );
  const sortedMembers = useMemo(() => {
    return [...members].sort((left, right) => {
      if (left.role !== right.role) {
        return left.role === "admin" ? -1 : 1;
      }

      return left.user.name.localeCompare(right.user.name, undefined, {
        sensitivity: "base",
      });
    });
  }, [members]);
  const activeServerMember = useMemo(() => {
    if (!activeAccount) {
      return null;
    }

    return (
      members.find(
        (member) =>
          member.user.name === activeAccount.name &&
          member.user.host === activeAccount.host
      ) ?? null
    );
  }, [activeAccount, members]);
  const canModerateMembers =
    activeUser?.role === "admin" || activeServerMember?.role === "admin";

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="border-b border-border/70 bg-background/80 px-4 py-4 backdrop-blur sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="-ml-2 size-9 shrink-0 rounded-full"
            onClick={onDone}
            aria-label="Back from server settings"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <h1 className="min-w-0 truncate text-xl font-semibold text-foreground">
            <span className="text-muted-foreground font-medium">
              Server settings
            </span>
            <span className="text-muted-foreground px-2">/</span>
            <span>{server?.server.title ?? "Unknown server"}</span>
          </h1>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-background)_92%,transparent),color-mix(in_oklab,var(--color-muted)_35%,white))] px-4 py-5 sm:px-6">
        {server ? (
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
            <section>
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  General
                </h2>
              </div>

              <div className="mt-5 overflow-hidden rounded-2xl border border-border/60 bg-background/35">
                <div className="grid gap-0 divide-y divide-border/60">
                  <div className="grid gap-2 px-4 py-4 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-6 sm:px-5">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Name
                      </p>
                    </div>
                    <div className="min-w-0 text-sm text-foreground">
                      {server.server.title}
                    </div>
                  </div>

                  <div className="grid gap-2 px-4 py-4 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-6 sm:px-5">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Host
                      </p>
                    </div>
                    <div className="min-w-0 text-sm text-foreground">
                      @{server.server.host}
                    </div>
                  </div>

                  <div className="grid gap-2 px-4 py-4 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-6 sm:px-5">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Description
                      </p>
                    </div>
                    <div className="min-w-0 whitespace-pre-wrap text-sm text-foreground/90">
                      {server.server.description?.trim() ||
                        "No description yet."}
                    </div>
                  </div>

                  <div className="grid gap-2 px-4 py-4 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-6 sm:px-5">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Member count
                      </p>
                    </div>
                    <div className="min-w-0 text-sm text-foreground">
                      {sortedMembers.length}
                    </div>
                  </div>

                  <div className="grid gap-2 px-4 py-4 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-6 sm:px-5">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Channels
                      </p>
                    </div>
                    <div className="min-w-0 text-sm text-foreground">
                      {server.channels.length}
                    </div>
                  </div>

                  <div className="grid gap-2 px-4 py-4 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-6 sm:px-5">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Created
                      </p>
                    </div>
                    <div className="min-w-0 text-sm text-foreground">
                      {formatServerTimestamp(server.server.created_at)}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <div className="flex items-center gap-2">
                <Users className="size-4 text-muted-foreground" />
                <h2 className="text-base font-semibold text-foreground">
                  Members
                </h2>
              </div>

              <div className="mt-5">
                {membersError ? (
                  <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {membersError}
                  </div>
                ) : isLoadingMembers ? (
                  <div className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
                    Loading members...
                  </div>
                ) : sortedMembers.length === 0 ? (
                  <div className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
                    No members are available for this server yet.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-border/70 bg-background/80">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Member</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Joined</TableHead>
                          <TableHead className="w-0 pr-3" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedMembers.map((member) => {
                          const initials = member.user.name
                            .slice(0, 2)
                            .toUpperCase();

                          const isActiveAccount =
                            activeAccount?.name === member.user.name &&
                            activeAccount.host === member.user.host;

                          return (
                            <TableRow
                              key={formatUserId(member.user)}
                              className="group"
                            >
                              <TableCell>
                                <div className="flex min-w-0 items-center gap-3">
                                  <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-xs font-semibold text-primary">
                                    {initials}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="truncate font-medium text-foreground">
                                      {member.user.name}
                                    </p>
                                    <p className="text-muted-foreground truncate text-xs">
                                      @{member.user.host}
                                    </p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="secondary"
                                  className={
                                    member.role === "admin"
                                      ? "rounded-full border border-violet-200 bg-violet-100 text-violet-700 dark:border-violet-400/30 dark:bg-violet-400/15 dark:text-violet-200"
                                      : "rounded-full"
                                  }
                                >
                                  {formatRoleLabel(member.role)}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
                                  <CircleDashed className="size-3.5" />
                                  Offline
                                </span>
                              </TableCell>
                              <TableCell className="text-right text-sm text-muted-foreground">
                                {formatServerTimestamp(member.joined_at)}
                              </TableCell>
                              <TableCell className="w-0 pr-3 text-right">
                                <MemberActionsMenu
                                  member={member}
                                  canKickMembers={
                                    canModerateMembers && !isActiveAccount
                                  }
                                  canManageMemberRoles={
                                    canModerateMembers && !isActiveAccount
                                  }
                                  onKickMember={onKickMember}
                                  onUpdateMemberRole={onUpdateMemberRole}
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </section>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-md rounded-3xl border border-border/70 bg-background/80 p-6 text-center shadow-sm backdrop-blur">
              <h2 className="text-lg font-semibold">Server unavailable</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                The selected server could not be found.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
