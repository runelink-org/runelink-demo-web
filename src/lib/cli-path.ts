type CliPathSegment = {
  flag: string;
  value: string;
};

function quoteCliValue(value: string): string {
  return JSON.stringify(value);
}

function formatCliPath(segments: CliPathSegment[]): string {
  return segments
    .map(({ flag, value }) => `--${flag}=${quoteCliValue(value)}`)
    .join(" ");
}

export function formatServerCliPath(host: string, serverId: string): string {
  return formatCliPath([
    { flag: "host", value: host },
    { flag: "server-id", value: serverId },
  ]);
}

export function formatChannelCliPath(
  host: string,
  serverId: string,
  channelId: string
): string {
  return formatCliPath([
    { flag: "host", value: host },
    { flag: "server-id", value: serverId },
    { flag: "channel-id", value: channelId },
  ]);
}

export function formatMessageCliPath(
  host: string,
  serverId: string,
  channelId: string,
  messageId: string
): string {
  return formatCliPath([
    { flag: "host", value: host },
    { flag: "server-id", value: serverId },
    { flag: "channel-id", value: channelId },
    { flag: "message-id", value: messageId },
  ]);
}
