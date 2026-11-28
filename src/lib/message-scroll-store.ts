import type { ResourceKey, ServerChannelId } from "@runelink/sdk";
import { appAtomRegistry, stateAtom } from "@/lib/atom-registry";
import { bindStoreToActiveAccount } from "@/lib/runelink-store-utils";

// Scroll positions by channel key
export const messageScrollAtom = stateAtom<
  Record<ResourceKey<ServerChannelId>, number>
>({});

export function setScrollTop(
  channelKey: ResourceKey<ServerChannelId>,
  scrollTop: number
): void {
  appAtomRegistry.update(messageScrollAtom, (scrollTopByChannelKey) => ({
    ...scrollTopByChannelKey,
    [channelKey]: scrollTop,
  }));
}

bindStoreToActiveAccount(() => {
  appAtomRegistry.set(messageScrollAtom, {});
});
