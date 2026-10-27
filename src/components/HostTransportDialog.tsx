import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useHostTransportPrompt } from "@/lib/host-transport";

export function HostTransportDialog() {
  const prompt = useHostTransportPrompt((state) => state.prompt);
  return (
    <AlertDialog
      open={prompt !== null}
      onOpenChange={(open) => {
        if (!open) prompt?.respond(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Allow an unencrypted connection?</AlertDialogTitle>
          <AlertDialogDescription>
            A secure connection to {prompt?.host} failed. Passwords, tokens, and
            messages will be sent unencrypted. Allow this only if you trust the
            network. Your approval will be remembered for this host and port in
            this browser.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => prompt?.respond(false)}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => prompt?.respond(true)}
          >
            Allow and remember
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
