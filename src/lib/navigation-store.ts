import { resourceKey } from "@runelink/sdk";
import type {
  ResourceKey,
  ServerChannelId,
  ServerId,
  ServerRef,
} from "@runelink/sdk";
import { appAtomRegistry, stateAtom } from "@/lib/atom-registry";
import {
  bindStoreToActiveAccount,
  sameResource,
} from "@/lib/runelink-store-utils";

type NavigationState = {
  selectedServerRef: ServerRef | null;
  // Channel IDs are on their server's host
  selectedChannelIdByServerKey: Record<
    ResourceKey<ServerId>,
    ServerChannelId | null
  >;
};

const initialState: NavigationState = {
  selectedServerRef: null,
  selectedChannelIdByServerKey: {},
};

export const navigationAtom = stateAtom(initialState);

export function selectServer(serverRef: ServerRef | null): void {
  appAtomRegistry.update(navigationAtom, (state) =>
    sameResource(state.selectedServerRef, serverRef)
      ? state
      : { ...state, selectedServerRef: serverRef }
  );
}

export function selectChannel(
  serverRef: ServerRef,
  channelId: ServerChannelId | null
): void {
  appAtomRegistry.update(navigationAtom, (state) => {
    const serverKey = resourceKey(serverRef);
    const currentChannelId =
      state.selectedChannelIdByServerKey[serverKey] ?? null;
    if (
      sameResource(state.selectedServerRef, serverRef) &&
      currentChannelId === channelId
    ) {
      return state;
    }

    return {
      selectedServerRef: serverRef,
      selectedChannelIdByServerKey: {
        ...state.selectedChannelIdByServerKey,
        [serverKey]: channelId,
      },
    };
  });
}

bindStoreToActiveAccount(() => {
  appAtomRegistry.set(navigationAtom, initialState);
});
