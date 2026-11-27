export function omitRecordKeys<T>(
  record: Record<string, T>,
  keys: Iterable<string>
): Record<string, T> {
  const blockedKeys = new Set(keys);

  return Object.fromEntries(
    Object.entries(record).filter(([entryKey]) => !blockedKeys.has(entryKey))
  );
}

export function omitRecordKey<T>(
  record: Record<string, T>,
  key: string
): Record<string, T> {
  return omitRecordKeys(record, [key]);
}
