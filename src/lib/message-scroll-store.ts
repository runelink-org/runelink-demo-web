import type { ResourceKey } from "@runelink/sdk";
import { appAtomRegistry, stateAtom } from "@/lib/atom-registry";
import { bindStoreToActiveAccount } from "@/lib/runelink-store-utils";

// Scroll positions by channel key
export const messageScrollAtom = stateAtom<Record<ResourceKey, number>>({});

export function setScrollTop(channelKey: ResourceKey, scrollTop: number): void {
  appAtomRegistry.update(messageScrollAtom, (scrollTopByChannelKey) => ({
    ...scrollTopByChannelKey,
    [channelKey]: scrollTop,
  }));
}

bindStoreToActiveAccount(() => {
  appAtomRegistry.set(messageScrollAtom, {});
});
