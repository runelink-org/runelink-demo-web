import * as Arr from "effect/Array";
import * as Order from "effect/Order";
import type {
  FullServerMembership,
  ServerMember,
  ServerMembership,
  UserRef,
} from "@runelink/sdk";
import { userRefKey } from "@/lib/runelink-store-utils";

const membershipOrder = Order.make<ServerMembership>((left, right) => {
  const byTitle = left.server.title.localeCompare(right.server.title);
  return Order.Number(
    byTitle === 0 ? left.server.id.localeCompare(right.server.id) : byTitle,
    0
  );
});

export function sortMemberships(
  memberships: readonly ServerMembership[]
): readonly ServerMembership[] {
  return Arr.sort(memberships, membershipOrder);
}

export function upsertMembership(
  memberships: readonly ServerMembership[],
  nextMembership: ServerMembership
): readonly ServerMembership[] {
  return sortMemberships([
    ...memberships.filter(
      (membership) => membership.server.id !== nextMembership.server.id
    ),
    nextMembership,
  ]);
}

export function removeMembership(
  memberships: readonly ServerMembership[],
  serverId: string
): readonly ServerMembership[] {
  return memberships.filter((membership) => membership.server.id !== serverId);
}

export function upsertMember(
  members: readonly ServerMember[],
  nextMember: ServerMember
): readonly ServerMember[] {
  const key = userRefKey(nextMember.user);
  return [
    ...members.filter((member) => userRefKey(member.user) !== key),
    nextMember,
  ];
}

export function removeMember(
  members: readonly ServerMember[],
  userRef: UserRef
): readonly ServerMember[] {
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
