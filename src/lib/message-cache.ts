import * as Arr from "effect/Array";
import * as Order from "effect/Order";
import { compareResourceVersions } from "./resource-version.ts";
import type { Message } from "@runelink/sdk";

const creationOrder = Order.make<Message>((left, right) => {
  const difference = Date.parse(left.created_at) - Date.parse(right.created_at);
  // Native sort treated an unparseable date as equal for this comparison.
  return Number.isNaN(difference) ? 0 : Order.Number(difference, 0);
});

// Deletion is terminal. Late create replies, events, or history fetches must
// never restore text after this client has received its deletion tombstone.
export function mergeMessages(
  current: readonly Message[],
  incoming: readonly Message[]
): Message[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    const previous = byId.get(message.id);
    if (previous && previous.deleted_at !== null) continue;
    if (
      previous &&
      message.deleted_at === null &&
      compareResourceVersions(previous, message) > 0
    ) {
      continue;
    }
    byId.set(message.id, message);
  }
  return Arr.sort(byId.values(), creationOrder);
}
