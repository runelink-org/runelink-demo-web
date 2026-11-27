import type { ServerChannel } from "@runelink/sdk";
import { stateAtom } from "@/lib/atom-registry";

type ChannelsState = {
  channelsByServerId: Record<string, readonly ServerChannel[] | undefined>;
  channelById: Record<string, ServerChannel | undefined>;
};

export const initialChannelsState: ChannelsState = {
  channelsByServerId: {},
  channelById: {},
};

export const channelsAtom = stateAtom(initialChannelsState);
