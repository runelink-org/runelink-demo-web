import * as Arr from "effect/Array";
import * as Order from "effect/Order";
import { resourceKey } from "@runelink/sdk";
import type {
  FullServerMembership,
  ServerMember,
  ServerMembership,
  ServerRef,
  UserRef,
} from "@runelink/sdk";
import { userRefKey } from "@/lib/runelink-store-utils";

const membershipOrder = Order.make<ServerMembership>((left, right) => {
  const byTitle = left.server.title.localeCompare(right.server.title);
  return Order.Number(
    byTitle === 0
      ? resourceKey(left.server).localeCompare(resourceKey(right.server))
      : byTitle,
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
    ...removeMembership(memberships, nextMembership.server),
    nextMembership,
  ]);
}

export function removeMembership(
  memberships: readonly ServerMembership[],
  serverRef: ServerRef
): readonly ServerMembership[] {
  const key = resourceKey(serverRef);
  return memberships.filter(
    (membership) => resourceKey(membership.server) !== key
  );
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
