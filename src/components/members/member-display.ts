import * as Order from "effect/Order";
import type { ServerMember, ServerRole } from "@runelink/sdk";
import { CircleDashed } from "lucide-react";

export const ROLE_LABELS: Record<ServerRole, string> = {
  admin: "Admin",
  member: "Member",
};

export const ROLE_TEXT_CLASS_NAMES: Record<ServerRole, string> = {
  admin: "text-violet-700 dark:text-violet-200",
  member: "text-foreground/80",
};

export const memberNameOrder = Order.make<ServerMember>((left, right) =>
  Order.Number(
    left.user.name.localeCompare(right.user.name, undefined, {
      sensitivity: "base",
    }),
    0
  )
);

// TODO: Show each member's synced presence instead of always offline (#14)
export const MemberStatus = {
  label: "Offline",
  Icon: CircleDashed,
};
