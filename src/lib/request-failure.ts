import type { RequestFailure } from "@/lib/runelink-session";

// Why a request failed, for people. Each failure has its own case, so a new
// kind of failure does not compile until it has a message.
export function requestFailureMessage(error: RequestFailure): string {
  switch (error._tag) {
    case "RunelinkAuthError":
      return "You don't have permission to do this.";
    case "RunelinkNotFoundError":
      return "It no longer exists.";
    // The host's message explains these
    case "RunelinkBadRequestError":
    case "RunelinkConflictError":
      return error.hostMessage;
    case "RunelinkInternalError":
      return "The host couldn't complete the request. Try again later.";
    case "RunelinkUnsupportedCapabilityError":
      // The issue explains why the host can't use it, such as which side
      // needs updating. Without one, this client lacks the capability.
      return error.issue ?? "This client doesn't support this.";
    case "RunelinkIncompatibleHostError":
      return "The host isn't compatible with this client.";
    case "RunelinkConnectionError":
      return "The connection to the host was lost. Try again once it reconnects.";
    case "RunelinkDisconnectedError":
    case "SessionChangedError":
      return "The connection changed before this finished. Try again.";
    case "NotConnectedError":
      return "You're not connected. Try again once you're connected.";
    case "RunelinkProtocolError":
      return "The host sent a reply this client can't read.";
    case "RunelinkInvalidRequestError":
      return "This client made an invalid request.";
  }
}
