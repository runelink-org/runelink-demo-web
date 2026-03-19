import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useRunelinkConnectionStore } from "@/lib/runelink-connection-store";

export function ConnectionCard() {
  const [isPinging, setIsPinging] = useState(false);
  const ping = useRunelinkConnectionStore((state) => state.ping);
  const status = useRunelinkConnectionStore((state) => state.status);
  const lastError = useRunelinkConnectionStore((state) => state.lastError);
  const lastMessageSentAt = useRunelinkConnectionStore(
    (state) => state.lastMessageSentAt
  );
  const lastMessageReceivedAt = useRunelinkConnectionStore(
    (state) => state.lastMessageReceivedAt
  );

  async function handlePing() {
    setIsPinging(true);
    try {
      await ping();
    } finally {
      setIsPinging(false);
    }
  }

  return (
    <Card className="w-full max-w-md lg:order-2">
      <CardHeader>
        <CardTitle>Server Connection</CardTitle>
        <CardDescription>
          Uses the RuneLink SDK over websocket against localhost.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <p>
            <span className="font-medium">Endpoint:</span>{" "}
            <code>ws://localhost:7000/ws/client</code>
          </p>
          <p className="mt-1">
            <span className="font-medium">Status:</span> {status}
          </p>
        </div>

        <Button
          onClick={() => void handlePing()}
          disabled={isPinging || status === "connecting"}
          className="w-full"
        >
          {isPinging ? "Pinging..." : "Ping Server"}
        </Button>

        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">
              Last message sent:
            </span>{" "}
            {lastMessageSentAt ?? "No messages sent yet"}
          </p>
          <p>
            <span className="font-medium text-foreground">
              Last message received:
            </span>{" "}
            {lastMessageReceivedAt ?? "No messages received yet"}
          </p>
          <p>
            <span className="font-medium text-foreground">Latest error:</span>{" "}
            {lastError ?? "None"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
