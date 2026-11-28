import type {
  MessageRef,
  ResourceId,
  ResourceRef,
  ServerChannelRef,
  ServerRef,
  TextChannelRef,
} from "@runelink/sdk";

// CLI arguments that locate a resource by its host and ID
function formatCliPath(ref: ResourceRef<ResourceId>, idFlag: string): string {
  return `--host=${JSON.stringify(ref.host)} --${idFlag}=${JSON.stringify(ref.id)}`;
}

export function formatServerCliPath(server: ServerRef): string {
  return formatCliPath(server, "server-id");
}

export function formatChannelCliPath(channel: ServerChannelRef): string {
  return formatCliPath(channel, "channel-id");
}

export function formatTextChannelCliPath(textChannel: TextChannelRef): string {
  return formatCliPath(textChannel, "text-channel-id");
}

export function formatMessageCliPath(message: MessageRef): string {
  return formatCliPath(message, "message-id");
}
