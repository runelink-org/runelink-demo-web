type VersionedResource = { updated_at: string };

export function compareResourceVersions(
  left: VersionedResource,
  right: VersionedResource
): number {
  const milliseconds =
    Date.parse(left.updated_at) - Date.parse(right.updated_at);
  if (milliseconds !== 0) return milliseconds;
  // Compare fractional seconds separately because Date.parse drops precision
  // beyond milliseconds. Parsing above also accounts for timezone offsets.
  function fraction(resource: VersionedResource): string {
    return (resource.updated_at.match(/\.(\d+)/)?.[1] ?? "").padEnd(9, "0");
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
