import type { UserRef } from "@runelink/sdk";
import { useAtomValue } from "@effect/atom-react";
import { presenceAtom, selectPresenceStatus } from "@/lib/presence-store";
import type { DisplayedPresenceStatus } from "@/lib/presence-store";
import { connectionAtom } from "@/lib/runelink-session";

export function usePresenceStatus(userRef: UserRef): DisplayedPresenceStatus {
  const connectedAccount = useAtomValue(
    connectionAtom,
    (state) => state.connectedAccount
  );
  return useAtomValue(presenceAtom, (state) =>
    selectPresenceStatus(state, userRef, connectedAccount)
  );
}
