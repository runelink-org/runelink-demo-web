import { useIsMounted } from "@/lib/use-is-mounted";
import { resourceKey } from "@runelink/sdk";
import type { ResourceKey, ResourceRef, Server } from "@runelink/sdk";
import { Globe } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getServerMonogram } from "./server-display";
import type { RequestEffect } from "@/lib/runelink-session";
import * as Effect from "effect/Effect";
import { requestFailureMessage } from "@/lib/request-failure";
import { runPromise } from "@/lib/runtime";

type JoinServerDialogProps = {
  open: boolean;
  activeHost: string | null;
  joinedServerKeys: ReadonlySet<ResourceKey>;
  onOpenChange: (open: boolean) => void;
  onSearchServers: (host: string) => RequestEffect<readonly Server[]>;
  onJoinServer: (server: ResourceRef) => RequestEffect<void>;
};

export function JoinServerDialog(props: JoinServerDialogProps) {
  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialogContent className="max-w-md sm:max-w-md">
        <JoinServerDialogForm
          key={`${props.open}:${props.activeHost}`}
          {...props}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}

function JoinServerDialogForm({
  open,
  activeHost,
  joinedServerKeys,
  onOpenChange,
  onSearchServers,
  onJoinServer,
}: JoinServerDialogProps) {
  const isMounted = useIsMounted();
  const [host, setHost] = useState(activeHost ?? "");
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<readonly Server[]>([]);
  const [hasSearched, setHasSearched] = useState(
    open && Boolean(activeHost?.trim())
  );
  const [isSearching, setIsSearching] = useState(
    open && Boolean(activeHost?.trim())
  );
  const [joiningServerKey, setJoiningServerKey] = useState<ResourceKey | null>(
    null
  );

  async function searchServers(nextHost: string) {
    if (!nextHost) {
      setError("Host name is required.");
      return;
    }
    setIsSearching(true);
    setError(null);
    setHasSearched(true);
    await runPromise(
      onSearchServers(nextHost).pipe(
        Effect.match({
          onSuccess: (servers) => {
            if (isMounted()) setResults(servers);
          },
          onFailure: (failure) => {
            setResults([]);
            setError(requestFailureMessage(failure));
          },
        })
      )
    ).finally(() => {
      if (isMounted()) setIsSearching(false);
    });
  }

  const searchInitialServers = useEffectEvent(onSearchServers);

  useEffect(() => {
    const nextHost = activeHost?.trim();
    if (!open || nextHost == null || nextHost === "") return undefined;
    let cancelled = false;
    void runPromise(
      searchInitialServers(nextHost).pipe(
        Effect.match({
          onSuccess: (servers) => {
            if (!cancelled) setResults(servers);
          },
          onFailure: (failure) => {
            if (!cancelled) setError(requestFailureMessage(failure));
          },
        })
      )
    ).finally(() => {
      if (!cancelled) setIsSearching(false);
    });
    return () => {
      cancelled = true;
    };
  }, [activeHost, open]);

  async function handleSearch(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    await searchServers(host.trim());
  }

  async function handleJoin(server: Server) {
    setJoiningServerKey(resourceKey(server));
    setError(null);

    await runPromise(
      onJoinServer(server).pipe(
        Effect.match({
          onSuccess: () => {
            if (isMounted()) onOpenChange(false);
          },
          onFailure: (failure) => {
            if (isMounted()) setError(requestFailureMessage(failure));
          },
        })
      )
    ).finally(() => {
      if (isMounted()) setJoiningServerKey(null);
    });
  }

  return (
    <div className="space-y-4">
      <AlertDialogHeader>
        <AlertDialogTitle>Join Server</AlertDialogTitle>
        <AlertDialogDescription>
          Enter a host to view its public servers, then join the one you want.
        </AlertDialogDescription>
      </AlertDialogHeader>

      <form
        className="space-y-3"
        onSubmit={(event) => {
          void handleSearch(event);
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="join-server-host">Host Name</Label>
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Globe className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="join-server-host"
                value={host}
                onChange={(event) => {
                  setHost(event.target.value);
                }}
                placeholder="example.com"
                className="pl-9"
                disabled={isSearching || joiningServerKey !== null}
                autoFocus
              />
            </div>
            <Button
              type="submit"
              variant="outline"
              disabled={isSearching || joiningServerKey !== null}
            >
              {isSearching ? "Searching..." : "Search"}
            </Button>
          </div>
        </div>
      </form>

      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          Results
        </p>
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {results.map((server) => {
            const serverKey = resourceKey(server);
            const isJoined = joinedServerKeys.has(serverKey);
            const isJoining = joiningServerKey === serverKey;
            const joinAction = isJoining ? "Joining..." : "Join";
            const joinLabel = isJoined ? "Joined" : joinAction;

            return (
              <div
                key={serverKey}
                className="flex items-start gap-3 rounded-2xl border border-border/70 bg-muted/30 p-3"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/80 text-sm font-semibold text-foreground shadow-sm">
                  {getServerMonogram(server.title)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {server.title}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    @{server.host}
                  </p>
                  {server.description != null && server.description !== "" ? (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {server.description}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={isJoined ? "outline" : "default"}
                  disabled={isJoined || joiningServerKey !== null}
                  onClick={() => {
                    void handleJoin(server);
                  }}
                >
                  {joinLabel}
                </Button>
              </div>
            );
          })}

          {hasSearched ? null : (
            <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              Search a host to see which servers are available to join.
            </div>
          )}

          {hasSearched && !isSearching && results.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              No servers were found for that host.
            </div>
          ) : null}
        </div>
      </div>

      {error != null && error !== "" ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}

      <AlertDialogFooter>
        <AlertDialogCancel disabled={isSearching || joiningServerKey !== null}>
          Close
        </AlertDialogCancel>
      </AlertDialogFooter>
    </div>
  );
}
