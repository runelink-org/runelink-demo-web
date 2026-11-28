export function omitRecordKeys<K extends string, T>(
  record: Record<K, T>,
  keys: Iterable<K>
): Record<K, T> {
  const next = { ...record };
  for (const key of keys) {
    // oxlint-disable-next-line typescript/no-dynamic-delete -- Records are keyed by data, and this copy is local.
    delete next[key];
  }
  return next;
}

export function omitRecordKey<K extends string, T>(
  record: Record<K, T>,
  key: K
): Record<K, T> {
  return omitRecordKeys(record, [key]);
}
