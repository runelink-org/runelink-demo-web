import { compareResourceVersions } from "./resource-version.ts";
import type { Message } from "@runelink/sdk";

// Deletion is terminal. Late create replies, events, or history fetches must
// never restore text after this client has received its deletion tombstone.
export function mergeMessages(
  current: Message[],
  incoming: Message[]
): Message[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    const previous = byId.get(message.id);
    if (previous && previous.deleted_at !== null) continue;
    if (
      previous &&
      message.deleted_at === null &&
      compareResourceVersions(previous, message) > 0
    )
      continue;
    byId.set(message.id, message);
  }
  return [...byId.values()].sort(
    (left, right) => left.created_at.getTime() - right.created_at.getTime()
  );
}
