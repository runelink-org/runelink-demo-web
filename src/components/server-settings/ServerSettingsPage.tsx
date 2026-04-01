import type { ServerMember, ServerWithChannels } from "@runelink/sdk";
import { ArrowLeft, Users } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ServerMembersTable } from "@/components/server-settings/ServerMembersTable";
import { getActiveAccount, useAuthStore } from "@/lib/auth-store";
import { userRefKey } from "@/lib/runelink-store-utils";
import { useUsersStore } from "@/lib/users-store";

type ServerSettingsPageProps = {
  server: ServerWithChannels | null;
  members: ServerMember[];
  isLoadingMembers: boolean;
  membersError: string | null;
  onDone: () => void;
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

export function ServerSettingsPage({
  server,
  members,
  isLoadingMembers,
  membersError,
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
                <ServerMembersTable
                  serverId={server.server.id}
                  serverHost={server.server.host}
                  members={sortedMembers}
                  isLoadingMembers={isLoadingMembers}
                  membersError={membersError}
                  activeAccount={activeAccount}
                  canModerateMembers={canModerateMembers}
                />
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
