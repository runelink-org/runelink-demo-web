import { appAtomRegistry, stateAtom } from "@/lib/atom-registry";
import { bindStoreToActiveAccount } from "@/lib/runelink-store-utils";

// Scroll positions by channel key
export const messageScrollAtom = stateAtom<Record<string, number>>({});

export function setScrollTop(channelKey: string, scrollTop: number): void {
  appAtomRegistry.update(messageScrollAtom, (scrollTopByChannelKey) => ({
    ...scrollTopByChannelKey,
    [channelKey]: scrollTop,
  }));
}

bindStoreToActiveAccount(() => {
  appAtomRegistry.set(messageScrollAtom, {});
});
