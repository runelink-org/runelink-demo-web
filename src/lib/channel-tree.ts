import type { ServerChannel, ServerChannelMove } from "@runelink/sdk";

export type ChannelRow = {
  channel: ServerChannel;
  depth: number;
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

// Sorted children by parent ID, with null for the server root. Channels with
// a missing parent are treated as root channels.
function childrenByParent(
  channels: ServerChannel[]
): Map<string | null, ServerChannel[]> {
  const ids = new Set(channels.map((channel) => channel.id));
  const children = new Map<string | null, ServerChannel[]>();
  for (const channel of channels) {
    const parentId =
      channel.parent_channel_id && ids.has(channel.parent_channel_id)
        ? channel.parent_channel_id
        : null;
    const siblings = children.get(parentId);
    if (siblings) {
      siblings.push(channel);
    } else {
      children.set(parentId, [channel]);
    }
  }
  for (const siblings of children.values()) {
    siblings.sort(compareChannels);
  }
  return children;
}

function parentOf(
  children: Map<string | null, ServerChannel[]>,
  channelId: string
): string | null {
  for (const [parentId, siblings] of children) {
    if (siblings.some((channel) => channel.id === channelId)) {
      return parentId;
    }
  }
  return null;
}

export function childrenOf(
  channels: ServerChannel[],
  parentId: string | null
): ServerChannel[] {
  return childrenByParent(channels).get(parentId) ?? [];
}

// Channels in depth-first tree order, skipping children of collapsed
// categories
export function visibleRows(
  channels: ServerChannel[],
  collapsedIds: ReadonlySet<string>
): ChannelRow[] {
  const children = childrenByParent(channels);
  const rows: ChannelRow[] = [];

  function visit(parentId: string | null, depth: number) {
    for (const channel of children.get(parentId) ?? []) {
      rows.push({ channel, depth });
      if (channel.kind === "category" && !collapsedIds.has(channel.id)) {
        visit(channel.id, depth + 1);
      }
    }
  }

  visit(null, 0);
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

// IDs of the ancestors of a channel, nearest first
export function ancestorIds(
  channels: ServerChannel[],
  channelId: string
): string[] {
  const children = childrenByParent(channels);
  const ancestors: string[] = [];
  let parentId = parentOf(children, channelId);
  while (parentId && !ancestors.includes(parentId)) {
    ancestors.push(parentId);
    parentId = parentOf(children, parentId);
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
  const children = childrenByParent(channels);
  const siblingsOf = (parentId: string | null) =>
    (children.get(parentId) ?? []).filter((c) => c.id !== draggedId);

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
      : parentOf(children, targetChannel.id);
  if (
    (target.placement === "inside" && targetChannel.kind !== "category") ||
    [parentId, ...(parentId ? ancestorIds(channels, parentId) : [])].includes(
      draggedId
    )
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

// Whether a move would leave the channel where it already is
export function isNoOpMove(
  channels: ServerChannel[],
  channelId: string,
  move: ServerChannelMove
): boolean {
  const children = childrenByParent(channels);
  if (parentOf(children, channelId) !== move.parent_channel_id) {
    return false;
  }
  const siblings = children.get(move.parent_channel_id) ?? [];
  const currentIndex = siblings.findIndex((c) => c.id === channelId);
  return Math.min(move.index, siblings.length - 1) === currentIndex;
}
