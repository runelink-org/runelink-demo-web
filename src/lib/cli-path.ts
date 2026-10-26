// CLI arguments that locate a resource by its host and ID
function formatCliPath(host: string, idFlag: string, id: string): string {
  return `--host=${JSON.stringify(host)} --${idFlag}=${JSON.stringify(id)}`;
}

export function formatServerCliPath(host: string, serverId: string): string {
  return formatCliPath(host, "server-id", serverId);
}

export function formatChannelCliPath(host: string, channelId: string): string {
  return formatCliPath(host, "channel-id", channelId);
}

export function formatTextChannelCliPath(
  host: string,
  textChannelId: string
): string {
  return formatCliPath(host, "text-channel-id", textChannelId);
}

export function formatMessageCliPath(host: string, messageId: string): string {
  return formatCliPath(host, "message-id", messageId);
}
