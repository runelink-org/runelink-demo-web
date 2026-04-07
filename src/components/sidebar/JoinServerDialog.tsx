import type { Server } from "@runelink/sdk";
import { Globe } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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

type JoinServerDialogProps = {
  open: boolean;
  activeHost: string | null;
  joinedServerIds: Set<string>;
  onOpenChange: (open: boolean) => void;
  onSearchServers: (host: string) => Promise<Server[]>;
  onJoinServer: (serverId: string, serverHost: string) => Promise<void>;
};

export function JoinServerDialog({
  open,
  activeHost,
  joinedServerIds,
  onOpenChange,
  onSearchServers,
  onJoinServer,
}: JoinServerDialogProps) {
  const [host, setHost] = useState(activeHost ?? "");
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Server[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [joiningServerId, setJoiningServerId] = useState<string | null>(null);

  useEffect(() => {
    if (activeHost && !open) {
      setHost(activeHost);
    }
  }, [activeHost, open]);

  const searchServers = useCallback(
    async function searchServers(nextHost: string) {
      if (!nextHost) {
        setError("Host name is required.");
        return;
      }

      setIsSearching(true);
      setError(null);
      setHasSearched(true);

      try {
        setResults(await onSearchServers(nextHost));
      } catch (nextError) {
        setResults([]);
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Failed to load servers"
        );
      } finally {
        setIsSearching(false);
      }
    },
    [onSearchServers]
  );

  useEffect(() => {
    if (!open || hasSearched || isSearching || joiningServerId !== null) {
      return;
    }

    const nextHost = (activeHost ?? host).trim();
    if (!nextHost) {
      return;
    }

    void searchServers(nextHost);
  }, [
    activeHost,
    hasSearched,
    host,
    isSearching,
    joiningServerId,
    open,
    searchServers,
  ]);

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen);

    if (!nextOpen) {
      setError(null);
      setResults([]);
      setHasSearched(false);
      setJoiningServerId(null);
      setHost(activeHost ?? "");
    }
  }

  async function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await searchServers(host.trim());
  }

  async function handleJoin(server: Server) {
    setJoiningServerId(server.id);
    setError(null);

    try {
      await onJoinServer(server.id, server.host);
      onOpenChange(false);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Failed to join server"
      );
    } finally {
      setJoiningServerId(null);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="max-w-md sm:max-w-md">
        <div className="space-y-4">
          <AlertDialogHeader>
            <AlertDialogTitle>Join server</AlertDialogTitle>
            <AlertDialogDescription>
              Enter a host to view its public servers, then join the one you
              want.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <form className="space-y-3" onSubmit={handleSearch}>
            <div className="space-y-2">
              <Label htmlFor="join-server-host">Host name</Label>
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Globe className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="join-server-host"
                    value={host}
                    onChange={(event) => setHost(event.target.value)}
                    placeholder="example.com"
                    className="pl-9"
                    disabled={isSearching || joiningServerId !== null}
                    autoFocus
                  />
                </div>
                <Button
                  type="submit"
                  variant="outline"
                  disabled={isSearching || joiningServerId !== null}
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
                const isJoined = joinedServerIds.has(server.id);
                const isJoining = joiningServerId === server.id;

                return (
                  <div
                    key={server.id}
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
                      {server.description ? (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {server.description}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant={isJoined ? "outline" : "default"}
                      disabled={isJoined || joiningServerId !== null}
                      onClick={() => {
                        void handleJoin(server);
                      }}
                    >
                      {isJoined ? "Joined" : isJoining ? "Joining..." : "Join"}
                    </Button>
                  </div>
                );
              })}

              {!hasSearched ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                  Search a host to see which servers are available to join.
                </div>
              ) : null}

              {hasSearched && !isSearching && results.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                  No servers were found for that host.
                </div>
              ) : null}
            </div>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isSearching || joiningServerId !== null}
            >
              Close
            </AlertDialogCancel>
          </AlertDialogFooter>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
