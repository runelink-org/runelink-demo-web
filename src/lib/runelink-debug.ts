export function debugRunelink(label: string, payload?: unknown): void {
  if (!import.meta.env.DEV) {
    return;
  }
  if (payload === undefined) {
    console.debug(`[runelink-demo] ${label}`);
    return;
  }
  console.debug(`[runelink-demo] ${label}`, payload);
}
