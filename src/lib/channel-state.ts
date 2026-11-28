import type {
  ResourceKey,
  ServerChannel,
  ServerChannelId,
  ServerId,
} from "@runelink/sdk";
import { stateAtom } from "@/lib/atom-registry";

type ChannelsState = {
  channelsByServerKey: Record<
    ResourceKey<ServerId>,
    readonly ServerChannel[] | undefined
  >;
  channelByKey: Record<ResourceKey<ServerChannelId>, ServerChannel | undefined>;
};

export const initialChannelsState: ChannelsState = {
  channelsByServerKey: {},
  channelByKey: {},
};

export const channelsAtom = stateAtom(initialChannelsState);
