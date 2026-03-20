import { type NewUser, type User, type UserRef } from "@runelink/sdk";
import { create } from "zustand";
import { requestExpected } from "@/lib/runelink-request";
import {
  bindStoreToActiveAccount,
  type TargetHost,
  userRefKey,
} from "@/lib/runelink-store-utils";

type UsersState = {
  users: User[];
  userByRefKey: Record<string, User>;
  associatedHostsByUserRefKey: Record<string, string[]>;
  isLoading: boolean;
  error: string | null;
  fetchUsers: (targetHost?: TargetHost) => Promise<User[]>;
  fetchUserByRef: (userRef: UserRef, targetHost?: TargetHost) => Promise<User>;
  fetchAssociatedHosts: (
    userRef: UserRef,
    targetHost?: TargetHost
  ) => Promise<string[]>;
  createUser: (newUser: NewUser) => Promise<User>;
  deleteUser: (userRef: UserRef) => Promise<void>;
  reset: () => void;
};

const initialState = {
  users: [],
  userByRefKey: {},
  associatedHostsByUserRefKey: {},
  isLoading: false,
  error: null,
};

function upsertUser(users: User[], nextUser: User): User[] {
  const key = userRefKey(nextUser);
  const nextUsers = users.filter((user) => userRefKey(user) !== key);
  nextUsers.push(nextUser);
  return nextUsers;
}

function removeUser(users: User[], userRef: UserRef): User[] {
  const key = userRefKey(userRef);
  return users.filter((user) => userRefKey(user) !== key);
}

export const useUsersStore = create<UsersState>((set) => ({
  ...initialState,
  async fetchUsers(targetHost = null) {
    set({ isLoading: true, error: null });

    try {
      const reply = await requestExpected("users_get_all", {
        type: "users_get_all",
        data: { target_host: targetHost },
      });

      const userByRefKey = Object.fromEntries(
        reply.data.map((user) => [userRefKey(user), user])
      );

      set((state) => ({
        users: reply.data,
        userByRefKey: {
          ...state.userByRefKey,
          ...userByRefKey,
        },
        isLoading: false,
        error: null,
      }));

      return reply.data;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load users";
      set({ isLoading: false, error: message });
      throw error;
    }
  },
  async fetchUserByRef(userRef, targetHost = null) {
    set({ isLoading: true, error: null });

    try {
      const reply = await requestExpected("users_get_by_ref", {
        type: "users_get_by_ref",
        data: {
          user_ref: userRef,
          target_host: targetHost,
        },
      });

      set((state) => ({
        users: upsertUser(state.users, reply.data),
        userByRefKey: {
          ...state.userByRefKey,
          [userRefKey(reply.data)]: reply.data,
        },
        isLoading: false,
        error: null,
      }));

      return reply.data;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load user";
      set({ isLoading: false, error: message });
      throw error;
    }
  },
  async fetchAssociatedHosts(userRef, targetHost = null) {
    set({ isLoading: true, error: null });

    try {
      const reply = await requestExpected("users_get_associated_hosts", {
        type: "users_get_associated_hosts",
        data: {
          user_ref: userRef,
          target_host: targetHost,
        },
      });

      set((state) => ({
        associatedHostsByUserRefKey: {
          ...state.associatedHostsByUserRefKey,
          [userRefKey(userRef)]: reply.data,
        },
        isLoading: false,
        error: null,
      }));

      return reply.data;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load associated hosts";
      set({ isLoading: false, error: message });
      throw error;
    }
  },
  async createUser(newUser) {
    set({ isLoading: true, error: null });

    try {
      const reply = await requestExpected("users_create", {
        type: "users_create",
        data: newUser,
      });

      set((state) => ({
        users: upsertUser(state.users, reply.data),
        userByRefKey: {
          ...state.userByRefKey,
          [userRefKey(reply.data)]: reply.data,
        },
        isLoading: false,
        error: null,
      }));

      return reply.data;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create user";
      set({ isLoading: false, error: message });
      throw error;
    }
  },
  async deleteUser(userRef) {
    set({ isLoading: true, error: null });

    try {
      await requestExpected("users_delete", {
        type: "users_delete",
        data: { user_ref: userRef },
      });

      set((state) => {
        const nextUserByRefKey = { ...state.userByRefKey };
        const nextAssociatedHosts = { ...state.associatedHostsByUserRefKey };
        const key = userRefKey(userRef);
        delete nextUserByRefKey[key];
        delete nextAssociatedHosts[key];

        return {
          users: removeUser(state.users, userRef),
          userByRefKey: nextUserByRefKey,
          associatedHostsByUserRefKey: nextAssociatedHosts,
          isLoading: false,
          error: null,
        };
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete user";
      set({ isLoading: false, error: message });
      throw error;
    }
  },
  reset() {
    set(initialState);
  },
}));

bindStoreToActiveAccount(() => {
  useUsersStore.getState().reset();
});
