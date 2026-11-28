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

export function formatServerCliPath(serverRef: ServerRef): string {
  return formatCliPath(serverRef, "server-id");
}

export function formatChannelCliPath(channelRef: ServerChannelRef): string {
  return formatCliPath(channelRef, "channel-id");
}

export function formatTextChannelCliPath(
  textChannelRef: TextChannelRef
): string {
  return formatCliPath(textChannelRef, "text-channel-id");
}

export function formatMessageCliPath(messageRef: MessageRef): string {
  return formatCliPath(messageRef, "message-id");
}
