export function debugRunelink(label: string, payload?: unknown): void {
  if (!import.meta.env.DEV) {
    return;
  }
  const args = payload === undefined ? [] : [payload];
  console.debug(`[runelink-demo] ${label}`, ...args);
}

export function reportRunelinkFailure(
  level: "warn" | "error",
  message: string,
  cause: unknown
): void {
  if (level === "warn") {
    console.warn(message, cause);
    return;
  }
  console.error(message, cause);
}
