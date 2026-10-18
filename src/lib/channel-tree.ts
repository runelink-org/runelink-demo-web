import type { ServerChannel, ServerChannelMove } from "@runelink/sdk";

export type ChannelRow = {
  channel: ServerChannel;
  depth: number;
  // Shown collapsed, by its own state or a collapsed ancestor
  isCollapsed: boolean;
};

// Drops relative to a channel row, or after everything at the server root
export type DropTarget =
  | { channelId: string; placement: "before" | "after" | "inside" }
  | { channelId: null; placement: "root-end" };

// Siblings are ordered by position, then ID, matching the host
function compareChannels(left: ServerChannel, right: ServerChannel): number {
  if (left.position !== right.position) {
    return left.position - right.position;
  }
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

// Sorted children by parent ID, with null for the server root
function childrenByParent(
  channels: ServerChannel[]
): Map<string | null, ServerChannel[]> {
  const children = new Map<string | null, ServerChannel[]>();
  for (const channel of channels) {
    const siblings = children.get(channel.parent_channel_id);
    if (siblings) {
      siblings.push(channel);
    } else {
      children.set(channel.parent_channel_id, [channel]);
    }
  }
  for (const siblings of children.values()) {
    siblings.sort(compareChannels);
  }
  return children;
}

// Channels in depth-first tree order, skipping children of collapsed
// categories. The pinned channel and its ancestors stay visible inside
// collapsed categories, so the selected channel can't be hidden.
export function visibleRows(
  channels: ServerChannel[],
  collapsedIds: ReadonlySet<string>,
  pinnedId: string | null = null
): ChannelRow[] {
  const children = childrenByParent(channels);
  const pinnedPath = new Set(
    pinnedId ? [pinnedId, ...ancestorIds(channels, pinnedId)] : []
  );
  const rows: ChannelRow[] = [];

  function visit(parentId: string | null, depth: number, hidden: boolean) {
    for (const channel of children.get(parentId) ?? []) {
      if (hidden && !pinnedPath.has(channel.id)) {
        continue;
      }
      const isCollapsed = hidden || collapsedIds.has(channel.id);
      rows.push({ channel, depth, isCollapsed });
      if (channel.kind === "category") {
        visit(channel.id, depth + 1, isCollapsed);
      }
    }
  }

  visit(null, 0, false);
  return rows;
}

// Categories in tree order with their depth, for choosing a parent
export function categoryRows(channels: ServerChannel[]): ChannelRow[] {
  return visibleRows(channels, new Set()).filter(
    (row) => row.channel.kind === "category"
  );
}

// The first text channel in tree order
export function firstTextChannel(
  channels: ServerChannel[]
): ServerChannel | null {
  return (
    visibleRows(channels, new Set()).find((row) => row.channel.kind === "text")
      ?.channel ?? null
  );
}

// IDs of a channel's ancestors, nearest first
export function ancestorIds(
  channels: ServerChannel[],
  channelId: string
): string[] {
  const byId = new Map(channels.map((channel) => [channel.id, channel]));
  const ancestors: string[] = [];
  let parentId = byId.get(channelId)?.parent_channel_id ?? null;
  while (parentId) {
    ancestors.push(parentId);
    parentId = byId.get(parentId)?.parent_channel_id ?? null;
  }
  return ancestors;
}

// The move that drops `draggedId` at `target`, or null if the drop is
// invalid, such as a category into its own subtree
export function planDrop(
  channels: ServerChannel[],
  draggedId: string,
  target: DropTarget
): ServerChannelMove | null {
  const siblingsOf = (parentId: string | null) =>
    channels
      .filter((c) => c.parent_channel_id === parentId && c.id !== draggedId)
      .sort(compareChannels);

  if (target.placement === "root-end") {
    return { parent_channel_id: null, index: siblingsOf(null).length };
  }

  const targetChannel = channels.find((c) => c.id === target.channelId);
  if (!targetChannel || targetChannel.id === draggedId) {
    return null;
  }
  const parentId =
    target.placement === "inside"
      ? targetChannel.id
      : targetChannel.parent_channel_id;
  if (
    (target.placement === "inside" && targetChannel.kind !== "category") ||
    (parentId &&
      [parentId, ...ancestorIds(channels, parentId)].includes(draggedId))
  ) {
    return null;
  }

  // Dropping onto a category places the channel first inside it
  if (target.placement === "inside") {
    return { parent_channel_id: parentId, index: 0 };
  }
  const targetIndex = siblingsOf(parentId).findIndex(
    (c) => c.id === targetChannel.id
  );
  return {
    parent_channel_id: parentId,
    index: target.placement === "before" ? targetIndex : targetIndex + 1,
  };
}
