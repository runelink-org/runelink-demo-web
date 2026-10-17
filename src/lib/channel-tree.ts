import type { ServerChannel, ServerChannelMove } from "@runelink/sdk";

export type ChannelRow = {
  channel: ServerChannel;
  depth: number;
};

export type DropPlacement = "before" | "after" | "inside";

export type DropTarget = {
  channelId: string;
  placement: DropPlacement;
};

// Siblings are ordered by position, then ID, matching the host
function compareChannels(left: ServerChannel, right: ServerChannel): number {
  if (left.position !== right.position) {
    return left.position - right.position;
  }
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

// The parent used for display, treating channels with a missing parent as
// root channels
function effectiveParentId(
  channels: ServerChannel[],
  channel: ServerChannel
): string | null {
  const parentId = channel.parent_channel_id;
  return parentId && channels.some((c) => c.id === parentId) ? parentId : null;
}

export function childrenOf(
  channels: ServerChannel[],
  parentId: string | null
): ServerChannel[] {
  return channels
    .filter((channel) => effectiveParentId(channels, channel) === parentId)
    .sort(compareChannels);
}

// Channels in depth-first tree order, skipping children of collapsed
// categories
export function visibleRows(
  channels: ServerChannel[],
  collapsedIds: ReadonlySet<string>
): ChannelRow[] {
  const rows: ChannelRow[] = [];

  function visit(parentId: string | null, depth: number) {
    for (const channel of childrenOf(channels, parentId)) {
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

function isSelfOrDescendant(
  channels: ServerChannel[],
  channelId: string | null,
  ancestorId: string
): boolean {
  const visited = new Set<string>();
  let currentId = channelId;

  while (currentId && !visited.has(currentId)) {
    if (currentId === ancestorId) {
      return true;
    }
    visited.add(currentId);
    const current = channels.find((channel) => channel.id === currentId);
    currentId = current ? effectiveParentId(channels, current) : null;
  }

  return false;
}

// The move that drops `draggedId` at `target`, or null if the drop is
// invalid, such as a category into its own subtree
export function planDrop(
  channels: ServerChannel[],
  draggedId: string,
  target: DropTarget
): ServerChannelMove | null {
  const targetChannel = channels.find((c) => c.id === target.channelId);
  if (!targetChannel || targetChannel.id === draggedId) {
    return null;
  }

  if (target.placement === "inside") {
    if (
      targetChannel.kind !== "category" ||
      isSelfOrDescendant(channels, targetChannel.id, draggedId)
    ) {
      return null;
    }
    return {
      parent_channel_id: targetChannel.id,
      index: childrenOf(channels, targetChannel.id).filter(
        (channel) => channel.id !== draggedId
      ).length,
    };
  }

  const parentId = effectiveParentId(channels, targetChannel);
  if (isSelfOrDescendant(channels, parentId, draggedId)) {
    return null;
  }
  const siblings = childrenOf(channels, parentId).filter(
    (channel) => channel.id !== draggedId
  );
  const targetIndex = siblings.findIndex((c) => c.id === targetChannel.id);
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
  const channel = channels.find((c) => c.id === channelId);
  if (
    !channel ||
    effectiveParentId(channels, channel) !== move.parent_channel_id
  ) {
    return false;
  }
  const siblings = childrenOf(channels, move.parent_channel_id).filter(
    (c) => c.id !== channelId
  );
  const currentIndex = childrenOf(channels, move.parent_channel_id).findIndex(
    (c) => c.id === channelId
  );
  return Math.min(move.index, siblings.length) === currentIndex;
}
