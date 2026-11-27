import type { User, UserRef } from "@runelink/sdk";
import * as Effect from "effect/Effect";
import { setState, stateAtom } from "@/lib/atom-registry";
import { request } from "@/lib/runelink-session";
import {
  bindStoreToActiveAccount,
  userRefKey,
} from "@/lib/runelink-store-utils";
import type { TargetHost } from "@/lib/runelink-store-utils";

type UsersState = {
  userByRefKey: Record<string, User>;
};

const initialState: UsersState = { userByRefKey: {} };

export const usersAtom = stateAtom(initialState);

export const fetchUserByRef = Effect.fn("Users.fetchByRef")(function* (
  userRef: UserRef,
  targetHost: TargetHost = null
) {
  const reply = yield* request({
    type: "users_get_by_ref",
    data: {
      user_ref: userRef,
      target_host: targetHost,
    },
  });

  setState(usersAtom, (state) => ({
    userByRefKey: {
      ...state.userByRefKey,
      [userRefKey(reply.data)]: reply.data,
    },
  }));

  return reply.data;
});

bindStoreToActiveAccount(() => {
  setState(usersAtom, initialState);
});
