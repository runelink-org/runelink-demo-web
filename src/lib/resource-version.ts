type VersionedResource = { updated_at: Date; update_version?: string };

export function compareResourceVersions(
  left: VersionedResource,
  right: VersionedResource
): number {
  const milliseconds = left.updated_at.getTime() - right.updated_at.getTime();
  if (milliseconds !== 0) return milliseconds;
  // The host emits RFC3339 timestamps. JS Dates discard sub-millisecond digits.
  function fraction(resource: VersionedResource): string {
    return (resource.update_version?.match(/\.(\d+)/)?.[1] ?? "").padEnd(
      9,
      "0"
    );
  }
  return fraction(left).localeCompare(fraction(right));
}

export function newestResource<T extends VersionedResource>(
  incoming: T,
  current: T | undefined
): T {
  return current && compareResourceVersions(current, incoming) > 0
    ? current
    : incoming;
}
