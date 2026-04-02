import type { ServerMember, ServerRole } from "@runelink/sdk";
import { CircleDashed } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MemberActionsMenu } from "@/components/server-settings/MemberActionsMenu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ServerMembersTableProps = {
  serverId: string;
  serverHost: string;
  members: ServerMember[];
  isLoadingMembers: boolean;
  membersError: string | null;
  activeAccount: { name: string; host: string } | null;
  canModerateMembers: boolean;
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

const ROLE_LABELS: Record<ServerRole, string> = {
  admin: "Admin",
  member: "Member",
};

function formatRoleLabel(role: ServerRole): string {
  return ROLE_LABELS[role];
}

export function ServerMembersTable({
  serverId,
  serverHost,
  members,
  isLoadingMembers,
  membersError,
  activeAccount,
  canModerateMembers,
}: ServerMembersTableProps) {
  if (membersError) {
    return (
      <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        {membersError}
      </div>
    );
  }

  if (isLoadingMembers) {
    return (
      <div className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
        Loading members...
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
        No members are available for this server yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-background/80">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Member</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Joined</TableHead>
            <TableHead className="w-0 pr-3" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => {
            const initials = member.user.name.slice(0, 2).toUpperCase();
            const isActiveAccount =
              activeAccount?.name === member.user.name &&
              activeAccount.host === member.user.host;

            return (
              <TableRow
                key={`${member.user.name}@${member.user.host}`}
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
                        {isActiveAccount ? (
                          <span className="text-blue-600 dark:text-blue-300">
                            {" "}
                            (you)
                          </span>
                        ) : null}
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
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {formatServerTimestamp(member.joined_at)}
                </TableCell>
                <TableCell className="w-0 pr-3 text-right">
                  <MemberActionsMenu
                    serverId={serverId}
                    serverHost={serverHost}
                    member={member}
                    canKickMembers={canModerateMembers && !isActiveAccount}
                    canManageMemberRoles={canModerateMembers}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
