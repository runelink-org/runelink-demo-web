import { getApiUrl, padHost } from "@runelink/sdk";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { appAtomRegistry, stateAtom } from "@/lib/atom-registry";

const STORAGE_KEY = "runelink.demo.host-transports";
const PROBE_TIMEOUT_MS = 5_000;

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

const HostTransportsSchema = Schema.Record(
  Schema.String,
  Schema.Struct({
    secure: Schema.Boolean,
    allow_insecure: Schema.Boolean.pipe(
      Schema.withDecodingDefault(Effect.succeed(false))
    ),
  })
);
const decodeHostTransports = Schema.decodeUnknownOption(
  Schema.fromJsonString(HostTransportsSchema)
);

function loadHostTransports(): Record<
  string,
  (typeof HostTransportsSchema.Type)[string]
> {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw
    ? { ...Option.getOrElse(decodeHostTransports(raw), () => ({})) }
    : {};
}

type TransportPrompt = { host: string; respond: (approved: boolean) => void };

export const hostTransportPromptAtom = stateAtom<TransportPrompt | null>(null);

function confirmInsecureHost(host: string): Effect.Effect<boolean> {
  return Effect.callback<boolean>((resume) => {
    appAtomRegistry.set(hostTransportPromptAtom, {
      host,
      respond(approved) {
        appAtomRegistry.set(hostTransportPromptAtom, null);
        resume(Effect.succeed(approved));
      },
    });
    // Interrupted, such as when the connection attempt is cancelled
    return Effect.sync(() =>
      appAtomRegistry.set(hostTransportPromptAtom, null)
    );
  });
}

// Probes never carry credentials. Manual redirects let us reject a redirect
// rather than mistake one for a transport failure and try HTTP.
const probe = Effect.fn("HostTransport.probe")(function* (apiUrl: string) {
  const response = yield* Effect.tryPromise({
    try: (signal) =>
      fetch(`${apiUrl}/ping`, {
        credentials: "omit",
        redirect: "manual",
        signal,
      }),
    catch: (error) => error,
  }).pipe(
    Effect.timeoutOption(PROBE_TIMEOUT_MS),
    // A failed fetch is a transport failure, which may fall back to HTTP.
    Effect.catch((error) =>
      error instanceof TypeError ? Effect.succeedNone : Effect.die(error)
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

function transportKey(host: string): string {
  return padHost(host).replace(
    /:(\d+)$/,
    (_, port: string) => `:${Number(port)}`
  );
}

// Returns whether a previously connected host uses HTTPS, or null if this
// browser has not connected to it. Never prompts.
export function getKnownHostTransport(host: string): boolean | null {
  return loadHostTransports()[transportKey(host)]?.secure ?? null;
}

// Whether to connect to the host securely. Interrupting it closes any
// approval prompt it opened.
export const resolveHostTransport = Effect.fn("HostTransport.resolve")(
  function* (hostInput: string) {
    const host = transportKey(hostInput);
    const secure = yield* probe(getApiUrl(host, true));
    if (!secure) {
      if (window.location.protocol === "https:") {
        return yield* new HostUnreachableError({
          message: `Unable to connect securely to ${host}. This page requires a secure connection.`,
        });
      }
      if (!(yield* probe(getApiUrl(host, false)))) {
        return yield* new HostUnreachableError({
          message: `Could not reach host: ${host}`,
        });
      }
      const approved =
        loadHostTransports()[host]?.allow_insecure ||
        (yield* confirmInsecureHost(host));
      if (!approved) {
        return yield* new HostTransportError({
          message: `Unencrypted connection to ${host} was not approved.`,
        });
      }
    }
    const hosts = loadHostTransports();
    hosts[host] = {
      secure,
      allow_insecure: !secure || (hosts[host]?.allow_insecure ?? false),
    };
    yield* Effect.try({
      try: () =>
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(hosts)),
      catch: (error) =>
        new HostTransportError({
          message:
            error instanceof Error ? error.message : "Unable to save the host",
        }),
    });
    return secure;
  }
);
