import {
  type FullServerMembership,
  type NewServerMembership,
  type ServerMember,
  type ServerMembership,
  type UserRef,
} from "@runelink/sdk";
import { create } from "zustand";
import { debugRunelink } from "@/lib/runelink-debug";
import { sortMemberships, upsertMembership } from "@/lib/membership-utils";
import { requestExpected } from "@/lib/runelink-request";
import {
  bindStoreToActiveAccount,
  serverUserKey,
  type ServerId,
  type TargetHost,
  userRefKey,
} from "@/lib/runelink-store-utils";

type MembershipsState = {
  membershipsByUserRefKey: Record<string, ServerMembership[]>;
  membersByServerId: Record<string, ServerMember[]>;
  hasFetchedMembersByServerId: Record<string, boolean>;
  memberByServerAndUserKey: Record<string, ServerMember>;
  isLoadingByUserRefKey: Record<string, boolean>;
  isLoadingByServerId: Record<string, boolean>;
  error: string | null;
  fetchMembershipsByUser: (userRef: UserRef) => Promise<ServerMembership[]>;
  fetchMembersByServer: (
    serverId: ServerId,
    targetHost?: TargetHost
  ) => Promise<ServerMember[]>;
  fetchMembershipByUserAndServer: (
    serverId: ServerId,
    userRef: UserRef,
    targetHost?: TargetHost
  ) => Promise<ServerMember>;
  upsertMembership: (
    serverId: ServerId,
    newMembership: NewServerMembership
  ) => Promise<FullServerMembership>;
  deleteMembership: (
    serverId: ServerId,
    userRef: UserRef,
    targetHost?: TargetHost
  ) => Promise<void>;
  reset: () => void;
};

const initialState = {
  membershipsByUserRefKey: {},
  membersByServerId: {},
  hasFetchedMembersByServerId: {},
  memberByServerAndUserKey: {},
  isLoadingByUserRefKey: {},
  isLoadingByServerId: {},
  error: null,
};

function upsertMember(
  members: ServerMember[],
  nextMember: ServerMember
): ServerMember[] {
  const key = userRefKey(nextMember.user);
  const nextMembers = members.filter(
    (member) => userRefKey(member.user) !== key
  );
  nextMembers.push(nextMember);
  return nextMembers;
}

function removeMember(
  members: ServerMember[],
  userRef: UserRef
): ServerMember[] {
  const key = userRefKey(userRef);
  return members.filter((member) => userRefKey(member.user) !== key);
}

function removeMembership(
  memberships: ServerMembership[],
  serverId: ServerId
): ServerMembership[] {
  return memberships.filter((membership) => membership.server.id !== serverId);
}

function toServerMember(membership: FullServerMembership): ServerMember {
  return {
    user: membership.user,
    role: membership.role,
    joined_at: membership.joined_at,
    updated_at: membership.updated_at,
  };
}

function toServerMembership(
  membership: FullServerMembership,
  userRef: UserRef
): ServerMembership {
  return {
    server: membership.server,
    user_ref: userRef,
    role: membership.role,
    joined_at: membership.joined_at,
    updated_at: membership.updated_at,
    synced_at: membership.synced_at,
  };
}

export const useMembershipsStore = create<MembershipsState>((set) => ({
  ...initialState,

  async fetchMembershipsByUser(userRef) {
    const userKey = userRefKey(userRef);
    set((state) => ({
      isLoadingByUserRefKey: {
        ...state.isLoadingByUserRefKey,
        [userKey]: true,
      },
      error: null,
    }));

    try {
      const reply = await requestExpected("memberships_get_by_user", {
        type: "memberships_get_by_user",
        data: { user_ref: userRef },
      });

      set((state) => ({
        membershipsByUserRefKey: {
          ...state.membershipsByUserRefKey,
          [userKey]: sortMemberships(reply.data),
        },
        isLoadingByUserRefKey: {
          ...state.isLoadingByUserRefKey,
          [userKey]: false,
        },
        error: null,
      }));

      debugRunelink("fetched memberships by user", {
        userRef,
        serverIds: reply.data.map((membership) => membership.server.id),
      });

      return reply.data;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load memberships";
      set((state) => ({
        isLoadingByUserRefKey: {
          ...state.isLoadingByUserRefKey,
          [userKey]: false,
        },
        error: message,
      }));
      throw error;
    }
  },

  async fetchMembersByServer(serverId, targetHost = null) {
    set((state) => ({
      isLoadingByServerId: {
        ...state.isLoadingByServerId,
        [serverId]: true,
      },
      error: null,
    }));

    try {
      const reply = await requestExpected("memberships_get_members_by_server", {
        type: "memberships_get_members_by_server",
        data: {
          server_id: serverId,
          target_host: targetHost,
        },
      });

      const nextMemberByKey = Object.fromEntries(
        reply.data.map((member) => [
          serverUserKey(serverId, member.user),
          member,
        ])
      );

      set((state) => ({
        membersByServerId: {
          ...state.membersByServerId,
          [serverId]: reply.data,
        },
        hasFetchedMembersByServerId: {
          ...state.hasFetchedMembersByServerId,
          [serverId]: true,
        },
        memberByServerAndUserKey: {
          ...state.memberByServerAndUserKey,
          ...nextMemberByKey,
        },
        isLoadingByServerId: {
          ...state.isLoadingByServerId,
          [serverId]: false,
        },
        error: null,
      }));

      return reply.data;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load server members";
      set((state) => ({
        isLoadingByServerId: {
          ...state.isLoadingByServerId,
          [serverId]: false,
        },
        error: message,
      }));
      throw error;
    }
  },

  async fetchMembershipByUserAndServer(serverId, userRef, targetHost = null) {
    set((state) => ({
      isLoadingByServerId: {
        ...state.isLoadingByServerId,
        [serverId]: true,
      },
      error: null,
    }));

    try {
      const reply = await requestExpected(
        "memberships_get_by_user_and_server",
        {
          type: "memberships_get_by_user_and_server",
          data: {
            server_id: serverId,
            user_ref: userRef,
            target_host: targetHost,
          },
        }
      );

      set((state) => ({
        memberByServerAndUserKey: {
          ...state.memberByServerAndUserKey,
          [serverUserKey(serverId, userRef)]: reply.data,
        },
        membersByServerId: {
          ...state.membersByServerId,
          [serverId]: upsertMember(
            state.membersByServerId[serverId] ?? [],
            reply.data
          ),
        },
        isLoadingByServerId: {
          ...state.isLoadingByServerId,
          [serverId]: false,
        },
        error: null,
      }));

      return reply.data;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load membership";
      set((state) => ({
        isLoadingByServerId: {
          ...state.isLoadingByServerId,
          [serverId]: false,
        },
        error: message,
      }));
      throw error;
    }
  },

  async upsertMembership(serverId, newMembership) {
    set({ error: null });

    try {
      const reply = await requestExpected("memberships_upsert", {
        type: "memberships_upsert",
        data: {
          server_id: serverId,
          new_membership: newMembership,
        },
      });

      const member = toServerMember(reply.data);
      const membership = toServerMembership(reply.data, reply.data.user);
      const userKey = userRefKey(reply.data.user);

      set((state) => ({
        membershipsByUserRefKey: {
          ...state.membershipsByUserRefKey,
          [userKey]: upsertMembership(
            state.membershipsByUserRefKey[userKey] ?? [],
            membership
          ),
        },
        membersByServerId: {
          ...state.membersByServerId,
          [serverId]: upsertMember(
            state.membersByServerId[serverId] ?? [],
            member
          ),
        },
        memberByServerAndUserKey: {
          ...state.memberByServerAndUserKey,
          [serverUserKey(serverId, reply.data.user)]: member,
        },
        error: null,
      }));

      debugRunelink("created membership", {
        serverId,
        user: reply.data.user,
      });

      return reply.data;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create membership";
      set({ error: message });
      throw error;
    }
  },

  async deleteMembership(serverId, userRef, targetHost = null) {
    set({ error: null });

    try {
      await requestExpected("memberships_delete", {
        type: "memberships_delete",
        data: {
          server_id: serverId,
          user_ref: userRef,
          target_host: targetHost,
        },
      });

      set((state) => {
        const key = serverUserKey(serverId, userRef);
        const nextMemberByKey = { ...state.memberByServerAndUserKey };
        delete nextMemberByKey[key];

        return {
          membershipsByUserRefKey: {
            ...state.membershipsByUserRefKey,
            [userRefKey(userRef)]: removeMembership(
              state.membershipsByUserRefKey[userRefKey(userRef)] ?? [],
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
          memberByServerAndUserKey: nextMemberByKey,
          error: null,
        };
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete membership";
      set({ error: message });
      throw error;
    }
  },

  reset() {
    set(initialState);
  },
}));

bindStoreToActiveAccount(() => {
  useMembershipsStore.getState().reset();
});
