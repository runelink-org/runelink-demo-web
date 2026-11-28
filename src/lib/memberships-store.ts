import { resourceKey } from "@runelink/sdk";
import type {
  FullServerMembership,
  NewServerMembership,
  ResourceKey,
  ServerId,
  ServerMember,
  ServerMembership,
  ServerRef,
  UserRef,
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
  userRefKey,
} from "@/lib/runelink-store-utils";

type MembershipsState = {
  membershipsByUserRefKey: Record<string, readonly ServerMembership[]>;
  membersByServerKey: Record<ResourceKey<ServerId>, readonly ServerMember[]>;
  hasFetchedMembersByServerKey: Record<ResourceKey<ServerId>, boolean>;
  isLoadingByServerKey: Record<ResourceKey<ServerId>, boolean>;
};

const initialState: MembershipsState = {
  membershipsByUserRefKey: {},
  membersByServerKey: {},
  hasFetchedMembersByServerKey: {},
  isLoadingByServerKey: {},
};

export const membershipsAtom = stateAtom(initialState);

function setServerLoading(
  serverKey: ResourceKey<ServerId>,
  isLoading: boolean
): void {
  setState(membershipsAtom, (state) => ({
    isLoadingByServerKey: {
      ...state.isLoadingByServerKey,
      [serverKey]: isLoading,
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
      servers: reply.data.map((membership) => resourceKey(membership.server)),
    });

    return reply.data;
  }
);

export const fetchMembersByServer = Effect.fn("Memberships.fetchMembers")(
  function* (server: ServerRef) {
    const serverKey = resourceKey(server);
    setServerLoading(serverKey, true);
    const reply = yield* request({
      type: "memberships_get_members_by_server",
      data: { server },
    }).pipe(
      Effect.onError(() =>
        Effect.sync(() => {
          setServerLoading(serverKey, false);
        })
      )
    );

    setState(membershipsAtom, (state) => ({
      membersByServerKey: {
        ...state.membersByServerKey,
        [serverKey]: reply.data,
      },
      hasFetchedMembersByServerKey: {
        ...state.hasFetchedMembersByServerKey,
        [serverKey]: true,
      },
      isLoadingByServerKey: {
        ...state.isLoadingByServerKey,
        [serverKey]: false,
      },
    }));

    return reply.data;
  }
);

export const upsertMembership = Effect.fn("Memberships.upsert")(function* (
  newMembership: NewServerMembership
) {
  const reply = yield* request({
    type: "memberships_upsert",
    data: { new_membership: newMembership },
  });

  const userKey = userRefKey(reply.data.user);
  const serverKey = resourceKey(newMembership.server);
  setState(membershipsAtom, (state) => ({
    membershipsByUserRefKey: {
      ...state.membershipsByUserRefKey,
      [userKey]: upsertMembershipEntry(
        state.membershipsByUserRefKey[userKey] ?? [],
        toServerMembership(reply.data)
      ),
    },
    membersByServerKey: {
      ...state.membersByServerKey,
      [serverKey]: upsertMember(
        state.membersByServerKey[serverKey] ?? [],
        toServerMember(reply.data)
      ),
    },
  }));

  debugRunelink("created membership", {
    server: serverKey,
    user: reply.data.user,
  });

  return reply.data satisfies FullServerMembership;
});

// Memberships this client is deleting, whose deletion updates can arrive
// before the reply
const deletingMemberships = new Set<string>();

function deletingMembershipKey(server: ServerRef, userRef: UserRef): string {
  return `${resourceKey(server)}/${userRefKey(userRef)}`;
}

export function isDeletingMembership(
  server: ServerRef,
  userRef: UserRef
): boolean {
  return deletingMemberships.has(deletingMembershipKey(server, userRef));
}

export const deleteMembership = Effect.fn("Memberships.delete")(function* (
  server: ServerRef,
  userRef: UserRef
) {
  const userKey = userRefKey(userRef);
  const serverKey = resourceKey(server);
  const key = deletingMembershipKey(server, userRef);
  deletingMemberships.add(key);
  yield* request({
    type: "memberships_delete",
    data: {
      server,
      user_ref: userRef,
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
        server
      ),
    },
    membersByServerKey: {
      ...state.membersByServerKey,
      [serverKey]: removeMember(
        state.membersByServerKey[serverKey] ?? [],
        userRef
      ),
    },
  }));
});

bindStoreToActiveAccount(() => {
  setState(membershipsAtom, initialState);
});
