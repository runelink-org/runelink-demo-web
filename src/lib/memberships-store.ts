import {
  type FullServerMembership,
  type NewServerMembership,
  type ServerMember,
  type ServerMembership,
  type UserRef,
} from "@runelink/sdk";
import * as Effect from "effect/Effect";
import { setState, stateAtom } from "@/lib/atom-registry";
import { debugRunelink } from "@/lib/runelink-debug";
import {
  removeMember,
  removeMembership,
  sortMemberships,
  toServerMember,
  toServerMembership,
  upsertMember,
  upsertMembership as upsertMembershipEntry,
} from "@/lib/membership-utils";
import { request } from "@/lib/runelink-session";
import {
  bindStoreToActiveAccount,
  type ServerId,
  type TargetHost,
  userRefKey,
} from "@/lib/runelink-store-utils";

type MembershipsState = {
  membershipsByUserRefKey: Record<string, ReadonlyArray<ServerMembership>>;
  membersByServerId: Record<string, ReadonlyArray<ServerMember>>;
  hasFetchedMembersByServerId: Record<string, boolean>;
  isLoadingByServerId: Record<string, boolean>;
};

const initialState: MembershipsState = {
  membershipsByUserRefKey: {},
  membersByServerId: {},
  hasFetchedMembersByServerId: {},
  isLoadingByServerId: {},
};

export const membershipsAtom = stateAtom(initialState);

function setServerLoading(serverId: ServerId, isLoading: boolean): void {
  setState(membershipsAtom, (state) => ({
    isLoadingByServerId: {
      ...state.isLoadingByServerId,
      [serverId]: isLoading,
    },
  }));
}

export const fetchMembershipsByUser = Effect.fn("Memberships.fetchByUser")(
  function* (userRef: UserRef) {
    const reply = yield* request({
      type: "memberships_get_by_user",
      data: { user_ref: userRef },
    });

    setState(membershipsAtom, (state) => ({
      membershipsByUserRefKey: {
        ...state.membershipsByUserRefKey,
        [userRefKey(userRef)]: sortMemberships(reply.data),
      },
    }));

    debugRunelink("fetched memberships by user", {
      userRef,
      serverIds: reply.data.map((membership) => membership.server.id),
    });

    return reply.data;
  }
);

export const fetchMembersByServer = Effect.fn("Memberships.fetchMembers")(
  function* (serverId: ServerId, targetHost: TargetHost = null) {
    setServerLoading(serverId, true);
    const reply = yield* request({
      type: "memberships_get_members_by_server",
      data: {
        server_id: serverId,
        target_host: targetHost,
      },
    }).pipe(
      Effect.onError(() => Effect.sync(() => setServerLoading(serverId, false)))
    );

    setState(membershipsAtom, (state) => ({
      membersByServerId: {
        ...state.membersByServerId,
        [serverId]: reply.data,
      },
      hasFetchedMembersByServerId: {
        ...state.hasFetchedMembersByServerId,
        [serverId]: true,
      },
      isLoadingByServerId: {
        ...state.isLoadingByServerId,
        [serverId]: false,
      },
    }));

    return reply.data;
  }
);

export const upsertMembership = Effect.fn("Memberships.upsert")(function* (
  serverId: ServerId,
  newMembership: NewServerMembership
) {
  const reply = yield* request({
    type: "memberships_upsert",
    data: {
      server_id: serverId,
      new_membership: newMembership,
    },
  });

  const userKey = userRefKey(reply.data.user);
  setState(membershipsAtom, (state) => ({
    membershipsByUserRefKey: {
      ...state.membershipsByUserRefKey,
      [userKey]: upsertMembershipEntry(
        state.membershipsByUserRefKey[userKey] ?? [],
        toServerMembership(reply.data)
      ),
    },
    membersByServerId: {
      ...state.membersByServerId,
      [serverId]: upsertMember(
        state.membersByServerId[serverId] ?? [],
        toServerMember(reply.data)
      ),
    },
  }));

  debugRunelink("created membership", {
    serverId,
    user: reply.data.user,
  });

  return reply.data satisfies FullServerMembership;
});

// Memberships this client is deleting, whose deletion updates can arrive
// before the reply
const deletingMemberships = new Set<string>();

export function isDeletingMembership(
  serverId: string,
  userRef: UserRef
): boolean {
  return deletingMemberships.has(`${serverId}/${userRefKey(userRef)}`);
}

export const deleteMembership = Effect.fn("Memberships.delete")(function* (
  serverId: ServerId,
  userRef: UserRef,
  targetHost: TargetHost = null
) {
  const userKey = userRefKey(userRef);
  const key = `${serverId}/${userKey}`;
  deletingMemberships.add(key);
  yield* request({
    type: "memberships_delete",
    data: {
      server_id: serverId,
      user_ref: userRef,
      target_host: targetHost,
    },
  }).pipe(
    // Already removed, such as by an admin or another tab
    Effect.catchTags({ RunelinkNotFoundError: () => Effect.void }),
    Effect.ensuring(Effect.sync(() => deletingMemberships.delete(key)))
  );

  setState(membershipsAtom, (state) => ({
    membershipsByUserRefKey: {
      ...state.membershipsByUserRefKey,
      [userKey]: removeMembership(
        state.membershipsByUserRefKey[userKey] ?? [],
        serverId
      ),
    },
    membersByServerId: {
      ...state.membersByServerId,
      [serverId]: removeMember(
        state.membersByServerId[serverId] ?? [],
        userRef
      ),
    },
  }));
});

bindStoreToActiveAccount(() => {
  setState(membershipsAtom, initialState);
});
