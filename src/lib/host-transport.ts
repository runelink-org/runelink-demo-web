import { HostSchema, hostApiUrl } from "@runelink/sdk";
import type { Host } from "@runelink/sdk";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { loadStoredJson } from "@/lib/account-storage";
import { appAtomRegistry, stateAtom } from "@/lib/atom-registry";

const STORAGE_KEY = "runelink.demo.host-transports";
const PROBE_TIMEOUT_MS = 5000;

// The host could not be reached now, but may be later.
export class HostUnreachableError extends Schema.TaggedError<HostUnreachableError>()(
  "HostUnreachableError",
  { message: Schema.String }
) {}

// The host cannot be used until something changes, such as a redirect, a
// client error, or a declined unencrypted connection.
export class HostTransportError extends Schema.TaggedError<HostTransportError>()(
  "HostTransportError",
  { message: Schema.String }
) {}

class ProbeFetchError extends Schema.TaggedError<ProbeFetchError>()(
  "ProbeFetchError",
  { cause: Schema.Defect() }
) {}

const HostTransportSchema = Schema.Struct({
  secure: Schema.Boolean,
  allow_insecure: Schema.Boolean.pipe(
    Schema.withDecodingDefault(Effect.succeed(false))
  ),
});
type HostTransport = typeof HostTransportSchema.Type;

// Keys saved with the default port decode to the canonical host.
const decodeHostTransports = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Record(HostSchema, HostTransportSchema))
);

// A map, since a host such as `constructor` would find an object's prototype.
function loadHostTransports(): Map<string, HostTransport> {
  return new Map(
    Object.entries(loadStoredJson(STORAGE_KEY, decodeHostTransports, {}))
  );
}

function saveHostTransports(
  hosts: ReturnType<typeof loadHostTransports>
): void {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(Object.fromEntries(hosts))
  );
}

type TransportPrompt = { host: Host; respond: (approved: boolean) => void };

export const hostTransportPromptAtom = stateAtom<TransportPrompt | null>(null);

function confirmInsecureHost(host: Host): Effect.Effect<boolean> {
  return Effect.callback<boolean>((resume) => {
    appAtomRegistry.set(hostTransportPromptAtom, {
      host,
      respond(approved) {
        appAtomRegistry.set(hostTransportPromptAtom, null);
        resume(Effect.succeed(approved));
      },
    });
    // Interrupted, such as when the connection attempt is cancelled
    return Effect.sync(() => {
      appAtomRegistry.set(hostTransportPromptAtom, null);
    });
  });
}

// Probes never carry credentials. Manual redirects let us reject a redirect
// rather than mistake one for a transport failure and try HTTP.
const probe = Effect.fn("HostTransport.probe")(function* (apiUrl: string) {
  const response = yield* Effect.tryPromise({
    try: (signal) =>
      // The probe must see the native opaque-redirect response and the original fetch rejection.
      // @effect-diagnostics-next-line globalFetchInEffect:off
      fetch(`${apiUrl}/ping`, {
        credentials: "omit",
        redirect: "manual",
        signal,
      }),
    catch: (cause) => new ProbeFetchError({ cause }),
  }).pipe(
    Effect.timeoutOption(PROBE_TIMEOUT_MS),
    // A failed fetch is a transport failure, which may fall back to HTTP.
    Effect.catch(({ cause }) =>
      cause instanceof TypeError ? Effect.succeedNone : Effect.die(cause)
    )
  );
  if (Option.isNone(response)) return false;
  const { status, type } = response.value;
  if (type === "opaqueredirect" || (status >= 300 && status < 400)) {
    return yield* new HostTransportError({
      message: "Host connection redirects are not allowed.",
    });
  }
  if (!response.value.ok) {
    const message = `Host returned HTTP ${status}.`;
    if (status >= 500 || status === 408 || status === 429) {
      return yield* new HostUnreachableError({ message });
    }
    return yield* new HostTransportError({ message });
  }
  return true;
});

// Returns whether a previously connected host uses HTTPS, or null if this
// browser has not connected to it. Never prompts.
export function getKnownHostTransport(host: Host): boolean | null {
  const transport = loadHostTransports().get(host);
  // HTTP only counts once the user has approved it.
  if (transport === undefined) return null;
  if (transport.secure) return true;
  return transport.allow_insecure ? false : null;
}

// Whether to connect to the host securely. Interrupting it closes any
// approval prompt it opened.
export const resolveHostTransport = Effect.fn("HostTransport.resolve")(
  function* (host: Host) {
    const secure = yield* probe(hostApiUrl(host, true));
    if (!secure) {
      if (window.location.protocol === "https:") {
        return yield* new HostUnreachableError({
          message: `Unable to connect securely to ${host}. This page requires a secure connection.`,
        });
      }
      if (!(yield* probe(hostApiUrl(host, false)))) {
        return yield* new HostUnreachableError({
          message: `Could not reach host: ${host}`,
        });
      }
      const approved =
        loadHostTransports().get(host)?.allow_insecure === true ||
        (yield* confirmInsecureHost(host));
      if (!approved) {
        return yield* new HostTransportError({
          message: `Unencrypted connection to ${host} was not approved.`,
        });
      }
    }
    const hosts = loadHostTransports();
    hosts.set(host, {
      secure,
      allow_insecure: !secure || (hosts.get(host)?.allow_insecure ?? false),
    });
    yield* Effect.try({
      try: () => {
        saveHostTransports(hosts);
      },
      catch: (error) =>
        new HostTransportError({
          message:
            error instanceof Error ? error.message : "Unable to save the host",
        }),
    });
    return secure;
  }
);
