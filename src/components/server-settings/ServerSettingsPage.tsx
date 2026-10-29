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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requestExpected } from "@/lib/runelink-request";
import { handleRunelinkUpdate } from "@/lib/runelink-updates";
import type { ServerMember, ServerWithChannels } from "@runelink/sdk";
import { ArrowLeft, LogOut, Trash2, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DeleteServerDialog } from "@/components/sidebar/DeleteServerDialog";
import { LeaveServerDialog } from "@/components/sidebar/LeaveServerDialog";
import { Button } from "@/components/ui/button";
import { compareMemberNames } from "@/components/members/member-display";
import { ServerMembersTable } from "@/components/server-settings/ServerMembersTable";
import { getActiveAccount, useAuthStore } from "@/lib/auth-store";
import { useMembershipsStore } from "@/lib/memberships-store";
import { userRefKey } from "@/lib/runelink-store-utils";
import { useServersStore } from "@/lib/servers-store";
import { useUsersStore } from "@/lib/users-store";

type ServerSettingsPageProps = {
  server: ServerWithChannels | null;
  members: ServerMember[];
  isLoadingMembers: boolean;
  membersError: string | null;
  onDone: () => void;
};

function getTargetHost(serverHost: string, activeHost: string): string | null {
  return serverHost === activeHost ? null : serverHost;
}

function formatServerTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function ServerSettingsPage(props: ServerSettingsPageProps) {
  const account = useAuthStore(getActiveAccount);
  return (
    <ServerSettingsContent
      key={`${account ? userRefKey(account) : "none"}:${props.server?.server.id ?? "none"}`}
      {...props}
    />
  );
}

function normalizeDescription(value: string | null): string {
  return (value ?? "").replace(/[^\S\r\n]+$/gm, "").trim();
}

function ServerSettingsContent({
  server,
  members,
  isLoadingMembers,
  membersError,
  onDone,
}: ServerSettingsPageProps) {
  const [baseline, setBaseline] = useState(server?.server ?? null);
  const [title, setTitle] = useState(server?.server.title ?? "");
  const [description, setDescription] = useState(
    server?.server.description ?? ""
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isDiscardOpen, setIsDiscardOpen] = useState(false);
  const mountedRef = useRef(false);
  const submittedTitle = title.trim();
  const submittedDescription = normalizeDescription(description);
  const dirty =
    baseline !== null &&
    (submittedTitle !== baseline.title.trim() ||
      submittedDescription !== normalizeDescription(baseline.description));
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const activeAccount = useAuthStore(getActiveAccount);
  const deleteMembership = useMembershipsStore(
    (state) => state.deleteMembership
  );
  const deleteServer = useServersStore((state) => state.deleteServer);
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

      return compareMemberNames(left, right);
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

  function reset() {
    if (!server) return;
    setBaseline(server.server);
    setTitle(server.server.title);
    setDescription(server.server.description ?? "");
    setError(null);
    setSaved(false);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !activeAccount ||
      !baseline ||
      !canModerateMembers ||
      isSaving ||
      !dirty ||
      !submittedTitle
    )
      return;
    const account = activeAccount;
    setIsSaving(true);
    setError(null);
    setSaved(false);
    try {
      const reply = await requestExpected("servers_update", {
        type: "servers_update",
        data: {
          server_id: baseline.id,
          server_update: {
            title: submittedTitle,
            description: submittedDescription || null,
            expected_updated_at: baseline.updated_at,
          },
          target_host: getTargetHost(baseline.host, account.host),
        },
      });
      const active = getActiveAccount(useAuthStore.getState());
      if (active?.name !== account.name || active?.host !== account.host)
        return;
      handleRunelinkUpdate({ type: "server_upserted", data: reply.data });
      if (!mountedRef.current) return;
      setBaseline(reply.data);
      setTitle(reply.data.title);
      setDescription(reply.data.description ?? "");
      setSaved(true);
    } catch (error) {
      if (mountedRef.current)
        setError(
          error instanceof Error
            ? error.message
            : "Could not save server settings."
        );
    } finally {
      if (mountedRef.current) setIsSaving(false);
    }
  }

  async function handleLeaveServer(serverId: string, serverHost: string) {
    if (!activeAccount) {
      return;
    }

    await deleteMembership(
      serverId,
      activeAccount,
      getTargetHost(serverHost, activeAccount.host)
    );
    onDone();
  }

  async function handleDeleteServer(serverId: string, serverHost: string) {
    if (!activeAccount) {
      return;
    }

    await deleteServer(serverId, getTargetHost(serverHost, activeAccount.host));
    onDone();
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="border-b border-border/70 bg-background/80 px-4 py-4 backdrop-blur sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="-ml-2 size-9 shrink-0 rounded-full"
            onClick={() => {
              if (dirty) setIsDiscardOpen(true);
              else onDone();
            }}
            disabled={isSaving}
            aria-label="Back from server settings"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <h1 className="min-w-0 truncate text-xl font-semibold text-foreground">
            <span className="text-muted-foreground font-medium">
              Server Settings
            </span>
            <span className="text-muted-foreground px-2">/</span>
            <span>{server?.server.title ?? "Unknown Server"}</span>
          </h1>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-background px-4 py-5 sm:px-6">
        {server ? (
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
            <section>
              <h2 className="text-base font-semibold text-foreground">
                Overview
              </h2>
              <form className="mt-5 space-y-6" onSubmit={save}>
                <div className="space-y-2">
                  <Label htmlFor="server-title">Server Title</Label>
                  <Input
                    id="server-title"
                    value={title}
                    onChange={(event) => {
                      setTitle(event.target.value);
                      setSaved(false);
                    }}
                    disabled={!canModerateMembers || isSaving}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="server-description">Server Description</Label>
                  <Textarea
                    id="server-description"
                    value={description}
                    onChange={(event) => {
                      setDescription(event.target.value);
                      setSaved(false);
                    }}
                    rows={6}
                    className="min-h-40 resize-y field-sizing-fixed"
                    disabled={!canModerateMembers || isSaving}
                  />
                </div>
                {!canModerateMembers ? (
                  <p className="text-sm text-muted-foreground">
                    Only server admins can edit server settings.
                  </p>
                ) : null}
                {error ? (
                  <p role="alert" className="text-sm text-destructive">
                    {error} Your changes have been kept. Reset to load the
                    latest values.
                  </p>
                ) : null}
                <div className="flex items-center gap-3">
                  <Button
                    type="submit"
                    disabled={
                      !canModerateMembers ||
                      isSaving ||
                      !dirty ||
                      !submittedTitle
                    }
                  >
                    {isSaving ? "Saving..." : "Save Changes"}
                  </Button>
                  {dirty || error ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSaving}
                      onClick={reset}
                    >
                      Reset
                    </Button>
                  ) : null}
                  {saved ? (
                    <p role="status" className="text-sm text-muted-foreground">
                      Changes saved.
                    </p>
                  ) : null}
                </div>
              </form>
            </section>

            <section>
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Details
                </h2>
              </div>

              <div className="mt-5 overflow-hidden rounded-2xl border border-border/60 bg-background/35">
                <div className="grid gap-0 divide-y divide-border/60">
                  <div className="grid gap-2 px-4 py-4 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-6 sm:px-5">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Host
                      </p>
                    </div>
                    <div className="min-w-0 text-sm text-foreground">
                      {server.server.host}
                    </div>
                  </div>

                  <div className="grid gap-2 px-4 py-4 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-6 sm:px-5">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Member Count
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

            <section>
              <div>
                <h2 className="text-base font-semibold text-destructive">
                  Danger Zone
                </h2>
              </div>

              <div className="mt-5 overflow-hidden rounded-2xl border border-destructive/20 bg-destructive/5">
                <div className="grid gap-0 divide-y divide-destructive/15">
                  <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-destructive">
                        Leave Server
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      className="shrink-0"
                      disabled={isSaving}
                      onClick={() => {
                        setIsLeaveDialogOpen(true);
                      }}
                    >
                      <LogOut className="size-4" />
                      Leave Server
                    </Button>
                  </div>

                  <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-destructive">
                        Delete Server
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      className="shrink-0"
                      disabled={!canModerateMembers || isSaving}
                      onClick={() => {
                        if (!canModerateMembers) {
                          return;
                        }

                        setIsDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="size-4" />
                      Delete Server
                    </Button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-md rounded-3xl border border-border/70 bg-background/80 p-6 text-center shadow-sm backdrop-blur">
              <h2 className="text-lg font-semibold">Server Unavailable</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                The selected server could not be found.
              </p>
            </div>
          </div>
        )}

        <AlertDialog open={isDiscardOpen} onOpenChange={setIsDiscardOpen}>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
              <AlertDialogDescription>
                You have unsaved changes to this server. Discard them and leave
                settings?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Go Back</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={onDone}>
                Discard
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <LeaveServerDialog
          server={isLeaveDialogOpen && server ? server.server : null}
          onOpenChange={(open) => {
            setIsLeaveDialogOpen(open);
          }}
          onLeaveServer={handleLeaveServer}
        />

        <DeleteServerDialog
          server={isDeleteDialogOpen && server ? server.server : null}
          onOpenChange={(open) => {
            setIsDeleteDialogOpen(open);
          }}
          onDeleteServer={handleDeleteServer}
        />
      </div>
    </section>
  );
}
