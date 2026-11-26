import type {
  FullServerMembership,
  ServerMember,
  ServerMembership,
  UserRef,
} from "@runelink/sdk";
import { userRefKey } from "@/lib/runelink-store-utils";

export function sortMemberships(
  memberships: ReadonlyArray<ServerMembership>
): ReadonlyArray<ServerMembership> {
  return [...memberships].sort((left, right) => {
    const titleComparison = left.server.title.localeCompare(right.server.title);
    if (titleComparison !== 0) {
      return titleComparison;
    }
    return left.server.id.localeCompare(right.server.id);
  });
}

export function upsertMembership(
  memberships: ReadonlyArray<ServerMembership>,
  nextMembership: ServerMembership
): ReadonlyArray<ServerMembership> {
  return sortMemberships([
    ...memberships.filter(
      (membership) => membership.server.id !== nextMembership.server.id
    ),
    nextMembership,
  ]);
}

export function removeMembership(
  memberships: ReadonlyArray<ServerMembership>,
  serverId: string
): ReadonlyArray<ServerMembership> {
  return memberships.filter((membership) => membership.server.id !== serverId);
}

export function upsertMember(
  members: ReadonlyArray<ServerMember>,
  nextMember: ServerMember
): ReadonlyArray<ServerMember> {
  const key = userRefKey(nextMember.user);
  return [
    ...members.filter((member) => userRefKey(member.user) !== key),
    nextMember,
  ];
}

export function removeMember(
  members: ReadonlyArray<ServerMember>,
  userRef: UserRef
): ReadonlyArray<ServerMember> {
  const key = userRefKey(userRef);
  return members.filter((member) => userRefKey(member.user) !== key);
}

export function toServerMember(membership: FullServerMembership): ServerMember {
  return {
    user: membership.user,
    role: membership.role,
    joined_at: membership.joined_at,
    updated_at: membership.updated_at,
  };
}

export function toServerMembership(
  membership: FullServerMembership
): ServerMembership {
  return {
    server: membership.server,
    user_ref: membership.user,
    role: membership.role,
    joined_at: membership.joined_at,
    updated_at: membership.updated_at,
    synced_at: membership.synced_at,
  };
}
