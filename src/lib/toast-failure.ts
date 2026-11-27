import { toast } from "sonner";
import { reportRunelinkFailure } from "@/lib/runelink-debug";
import { requestFailureMessage } from "@/lib/request-failure";
import type { RequestFailure } from "@/lib/runelink-session";

// Shows why a user action failed in a toast, and returns the reason for an
// inline error. The error itself, with the host's message, goes to the console.
export function toastFailure(title: string, error: RequestFailure): string {
  const reason = requestFailureMessage(error);
  reportRunelinkFailure("warn", title, error);
  toast.error(title, { description: reason });
  return reason;
}
