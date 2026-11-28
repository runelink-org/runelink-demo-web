import {
  ActiveMessageSchema,
  MessageIdSchema,
  MessageSchema,
  ServerChannelIdSchema,
  ServerChannelSchema,
  ServerIdSchema,
  ServerRefSchema,
  ServerSchema,
  TextChannelIdSchema,
} from "@runelink/sdk";
import * as Schema from "effect/Schema";

// Fixtures are decoded through the SDK's schemas, which brand their IDs.
export const serverId = Schema.decodeUnknownSync(ServerIdSchema);
export const serverChannelId = Schema.decodeUnknownSync(ServerChannelIdSchema);
export const textChannelId = Schema.decodeUnknownSync(TextChannelIdSchema);
export const messageId = Schema.decodeUnknownSync(MessageIdSchema);
export const serverRef = Schema.decodeUnknownSync(ServerRefSchema);
export const server = Schema.decodeUnknownSync(ServerSchema);
export const serverChannel = Schema.decodeUnknownSync(ServerChannelSchema);
export const message = Schema.decodeUnknownSync(MessageSchema);
export const activeMessage = Schema.decodeUnknownSync(ActiveMessageSchema);

/** A readable UUID for fixtures, such as `uuid(1)`. */
export function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}
