import { getApiUrl, padHost } from "@runelink/sdk";
import { create } from "zustand";
import { z } from "zod";

const STORAGE_KEY = "runelink.demo.host-transports";

export class HostUnreachableError extends Error {}
const HostTransportsSchema = z.record(
  z.string(),
  z.object({
    secure: z.boolean(),
    allow_insecure: z.boolean().default(false),
  })
);

function loadHostTransports(): z.infer<typeof HostTransportsSchema> {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  try {
    const result = HostTransportsSchema.safeParse(raw ? JSON.parse(raw) : {});
    return result.success ? result.data : {};
  } catch {
    return {};
  }
}

type TransportPrompt = { host: string; respond: (approved: boolean) => void };

export const useHostTransportPrompt = create<{
  prompt: TransportPrompt | null;
}>(() => ({ prompt: null }));

function confirmInsecureHost(
  host: string,
  signal: AbortSignal
): Promise<boolean> {
  return new Promise((resolve) => {
    function finish(approved: boolean) {
      signal.removeEventListener("abort", cancel);
      useHostTransportPrompt.setState({ prompt: null });
      resolve(approved);
    }
    function cancel() {
      finish(false);
    }
    signal.addEventListener("abort", cancel, { once: true });
    useHostTransportPrompt.setState({ prompt: { host, respond: finish } });
    if (signal.aborted) cancel();
  });
}

// Probes never carry credentials. Manual redirects let us reject a redirect
// rather than mistake one for a transport failure and try HTTP.
async function probe(apiUrl: string, signal: AbortSignal): Promise<boolean> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/ping`, {
      credentials: "omit",
      redirect: "manual",
      signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]),
    });
  } catch (error) {
    signal.throwIfAborted();
    if (
      error instanceof TypeError ||
      (error instanceof DOMException && error.name === "TimeoutError")
    )
      return false;
    throw error;
  }
  if (
    response.type === "opaqueredirect" ||
    (response.status >= 300 && response.status < 400)
  ) {
    throw new Error("Host connection redirects are not allowed.");
  }
  if (!response.ok) {
    const message = `Host returned HTTP ${response.status}.`;
    if (
      response.status >= 500 ||
      response.status === 408 ||
      response.status === 429
    ) {
      throw new HostUnreachableError(message);
    }
    throw new Error(message);
  }
  return true;
}

export async function resolveHostTransport(
  host: string,
  signal: AbortSignal
): Promise<boolean> {
  host = padHost(host).replace(
    /:(\d+)$/,
    (_, port: string) => `:${Number(port)}`
  );
  const secure = await probe(getApiUrl(host, true), signal);
  if (!secure) {
    if (window.location.protocol === "https:") {
      throw new HostUnreachableError(
        `Unable to connect securely to ${host}. This page requires a secure connection.`
      );
    }
    if (!(await probe(getApiUrl(host, false), signal))) {
      throw new HostUnreachableError(`Could not reach host: ${host}`);
    }
    const approved =
      loadHostTransports()[host]?.allow_insecure ||
      (await confirmInsecureHost(host, signal));
    signal.throwIfAborted();
    if (!approved)
      throw new Error(`Unencrypted connection to ${host} was not approved.`);
  }
  signal.throwIfAborted();
  const hosts = loadHostTransports();
  hosts[host] = {
    secure,
    allow_insecure: !secure || (hosts[host]?.allow_insecure ?? false),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(hosts));
  return secure;
}
