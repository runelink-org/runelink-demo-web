import type { Server } from "@runelink/sdk";

export function getServerMonogram(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

export function formatServerTimestamp(value: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

export function isServerJoined(
  joinedServerIds: Set<string>,
  server: Server
): boolean {
  return joinedServerIds.has(server.id);
}
