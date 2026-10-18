import type { ServerMember, ServerRole } from "@runelink/sdk";
import { useMemo } from "react";
import { MemberActionsMenu } from "@/components/members/MemberActionsMenu";
import {
  compareMemberNames,
  MEMBER_STATUS,
  ROLE_LABELS,
  ROLE_TEXT_CLASS_NAMES,
} from "@/components/members/member-display";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type ServerMemberListProps = {
  serverId: string;
  serverHost: string;
  members: ServerMember[];
  isLoading: boolean;
  error: string | null;
  canModerateMembers: boolean;
};

const ROLE_ORDER: ServerRole[] = ["admin", "member"];

export function ServerMemberList({
  serverId,
  serverHost,
  members,
  isLoading,
  error,
  canModerateMembers,
}: ServerMemberListProps) {
  // TODO: Only list members who can access the selected channel, and move
  // offline members into an "Offline" section that role counts exclude (#14)
  const sections = useMemo(() => {
    return ROLE_ORDER.map((role) => ({
      role,
      members: members
        .filter((member) => member.role === role)
        .sort(compareMemberNames),
    })).filter((section) => section.members.length > 0);
  }, [members]);

  if (error || isLoading || members.length === 0) {
    return (
      <p
        className={cn(
          "px-2 py-4 text-sm",
          error ? "text-destructive" : "text-muted-foreground"
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
              <li
                key={`${member.user.name}@${member.user.host}`}
                className="group flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted"
              >
                <div className="relative shrink-0">
                  <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {member.user.name.slice(0, 2).toUpperCase()}
                  </div>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span
                          role="img"
                          aria-label={MEMBER_STATUS.label}
                          className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-background text-muted-foreground transition-colors group-hover:bg-muted"
                        />
                      }
                    >
                      <MEMBER_STATUS.Icon className="size-3" />
                    </TooltipTrigger>
                    <TooltipContent>{MEMBER_STATUS.label}</TooltipContent>
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
                  serverId={serverId}
                  serverHost={serverHost}
                  member={member}
                  canModerateMembers={canModerateMembers}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
