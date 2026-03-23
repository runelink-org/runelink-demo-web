import type { ServerMembership } from "@runelink/sdk";

export function sortMemberships(
  memberships: ServerMembership[]
): ServerMembership[] {
  return [...memberships].sort((left, right) => {
    const titleComparison = left.server.title.localeCompare(right.server.title);
    if (titleComparison !== 0) {
      return titleComparison;
    }
    return left.server.id.localeCompare(right.server.id);
  });
}

export function upsertMembership(
  memberships: ServerMembership[],
  nextMembership: ServerMembership
): ServerMembership[] {
  return sortMemberships([
    ...memberships.filter(
      (membership) => membership.server.id !== nextMembership.server.id
    ),
    nextMembership,
  ]);
}
