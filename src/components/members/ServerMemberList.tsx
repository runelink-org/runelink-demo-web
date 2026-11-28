import * as Arr from "effect/Array";
import type { ServerMember, ServerRef, ServerRole } from "@runelink/sdk";
import { useMemo } from "react";
import { MemberActionsMenu } from "@/components/members/MemberActionsMenu";
import {
  memberNameOrder,
  PRESENCE_STATUS_DISPLAY,
  ROLE_LABELS,
  ROLE_TEXT_CLASS_NAMES,
} from "@/components/members/member-display";
import { usePresenceStatus } from "@/components/members/use-presence-status";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useContextActionsMenu } from "@/lib/use-context-actions-menu";

type ServerMemberListProps = {
  serverRef: ServerRef;
  members: readonly ServerMember[];
  isLoading: boolean;
  error: string | null;
  canModerateMembers: boolean;
};

const ROLE_ORDER: ServerRole[] = ["admin", "member"];

function ServerMemberListItem({
  serverRef,
  member,
  canModerateMembers,
}: Pick<ServerMemberListProps, "serverRef" | "canModerateMembers"> & {
  member: ServerMember;
}) {
  const contextMenu = useContextActionsMenu();
  const status = PRESENCE_STATUS_DISPLAY[usePresenceStatus(member.user)];

  return (
    <li
      {...contextMenu.targetProps}
      className="group flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted"
    >
      <div className="relative shrink-0">
        <div className="flex size-8 select-none items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {member.user.name.slice(0, 2).toUpperCase()}
        </div>
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                role="img"
                aria-label={status.label}
                className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-background text-muted-foreground transition-colors group-hover:bg-muted"
              />
            }
          >
            <status.Icon className={cn("size-3", status.className)} />
          </TooltipTrigger>
          <TooltipContent>{status.label}</TooltipContent>
        </Tooltip>
      </div>
      <p
        className={cn(
          "min-w-0 flex-1 truncate text-sm font-medium",
          ROLE_TEXT_CLASS_NAMES[member.role]
        )}
      >
        {member.user.name}
      </p>
      <MemberActionsMenu
        contextMenu={contextMenu}
        serverRef={serverRef}
        userRef={member.user}
        role={member.role}
        canModerateMembers={canModerateMembers}
      />
    </li>
  );
}

export function ServerMemberList({
  serverRef,
  members,
  isLoading,
  error,
  canModerateMembers,
}: ServerMemberListProps) {
  // TODO: Only list members who can access the selected channel, and move
  // offline members into an "Offline" section that role counts exclude (#14)
  const sections = useMemo(
    () =>
      ROLE_ORDER.map((role) => ({
        role,
        members: Arr.sort(
          members.filter((member) => member.role === role),
          memberNameOrder
        ),
      })).filter((section) => section.members.length > 0),
    [members]
  );

  if ((error != null && error !== "") || isLoading || members.length === 0) {
    return (
      <p
        className={cn(
          "px-2 py-4 text-sm",
          error != null && error !== ""
            ? "text-destructive"
            : "text-muted-foreground"
        )}
      >
        {error ?? (isLoading ? "Loading members..." : "No members yet.")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {sections.map((section) => (
        <section key={section.role}>
          <h2 className="px-2 pb-1 text-xs font-semibold text-muted-foreground">
            {ROLE_LABELS[section.role]} — {section.members.length}
          </h2>
          <ul>
            {section.members.map((member) => (
              <ServerMemberListItem
                key={`${member.user.name}@${member.user.host}`}
                serverRef={serverRef}
                member={member}
                canModerateMembers={canModerateMembers}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
