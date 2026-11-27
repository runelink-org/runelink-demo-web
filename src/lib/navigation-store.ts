import { appAtomRegistry, stateAtom } from "@/lib/atom-registry";
import { bindStoreToActiveAccount } from "@/lib/runelink-store-utils";
import type { ChannelId, ServerId } from "@/lib/runelink-store-utils";

type NavigationState = {
  selectedServerId: ServerId | null;
  selectedChannelIdByServerId: Record<string, ChannelId | null>;
};

const initialState: NavigationState = {
  selectedServerId: null,
  selectedChannelIdByServerId: {},
};

export const navigationAtom = stateAtom(initialState);

export function selectServer(serverId: ServerId | null): void {
  appAtomRegistry.update(navigationAtom, (state) =>
    state.selectedServerId === serverId
      ? state
      : { ...state, selectedServerId: serverId }
  );
}

export function selectChannel(
  serverId: ServerId,
  channelId: ChannelId | null
): void {
  appAtomRegistry.update(navigationAtom, (state) => {
    const currentChannelId =
      state.selectedChannelIdByServerId[serverId] ?? null;
    if (state.selectedServerId === serverId && currentChannelId === channelId) {
      return state;
    }

    return {
      selectedServerId: serverId,
      selectedChannelIdByServerId: {
        ...state.selectedChannelIdByServerId,
        [serverId]: channelId,
      },
    };
  });
}

bindStoreToActiveAccount(() => {
  appAtomRegistry.set(navigationAtom, initialState);
});
