import * as Order from "effect/Order";
import type { ServerMember, ServerRole } from "@runelink/sdk";
import { Circle, CircleDashed } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { DisplayedPresenceStatus } from "@/lib/presence-store";

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

export const PRESENCE_STATUS_DISPLAY: Record<
  DisplayedPresenceStatus,
  { label: string; Icon: LucideIcon; className: string }
> = {
  online: {
    label: "Online",
    Icon: Circle,
    className: "fill-emerald-500 text-emerald-500",
  },
  do_not_disturb: {
    label: "Do Not Disturb",
    Icon: Circle,
    className: "fill-red-500 text-red-500",
  },
  invisible: {
    label: "Invisible",
    Icon: CircleDashed,
    className: "text-muted-foreground",
  },
  offline: {
    label: "Offline",
    Icon: CircleDashed,
    className: "text-muted-foreground",
  },
};
