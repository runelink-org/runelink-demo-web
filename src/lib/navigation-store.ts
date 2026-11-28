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
  selectedServer: ServerRef | null;
  // Channel IDs are on their server's host
  selectedChannelIdByServerKey: Record<
    ResourceKey<ServerId>,
    ServerChannelId | null
  >;
};

const initialState: NavigationState = {
  selectedServer: null,
  selectedChannelIdByServerKey: {},
};

export const navigationAtom = stateAtom(initialState);

export function selectServer(server: ServerRef | null): void {
  appAtomRegistry.update(navigationAtom, (state) =>
    sameResource(state.selectedServer, server)
      ? state
      : { ...state, selectedServer: server }
  );
}

export function selectChannel(
  server: ServerRef,
  channelId: ServerChannelId | null
): void {
  appAtomRegistry.update(navigationAtom, (state) => {
    const serverKey = resourceKey(server);
    const currentChannelId =
      state.selectedChannelIdByServerKey[serverKey] ?? null;
    if (
      sameResource(state.selectedServer, server) &&
      currentChannelId === channelId
    ) {
      return state;
    }

    return {
      selectedServer: server,
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
