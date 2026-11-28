import type { ResourceKey, ServerChannel } from "@runelink/sdk";
import { stateAtom } from "@/lib/atom-registry";

type ChannelsState = {
  channelsByServerKey: Record<
    ResourceKey,
    readonly ServerChannel[] | undefined
  >;
  channelByKey: Record<ResourceKey, ServerChannel | undefined>;
};

export const initialChannelsState: ChannelsState = {
  channelsByServerKey: {},
  channelByKey: {},
};

export const channelsAtom = stateAtom(initialChannelsState);
