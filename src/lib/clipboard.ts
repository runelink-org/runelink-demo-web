import { toast } from "sonner";

export async function copyToClipboard(value: string, successLabel: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    toast.error("Clipboard is not available.");
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    toast.success(successLabel);
  } catch {
    toast.error("Failed to copy.");
  }
}
