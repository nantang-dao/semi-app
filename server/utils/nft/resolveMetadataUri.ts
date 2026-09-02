const ARWEAVE_GATEWAYS = [
  "https://arweave.net",
  "https://ar-io.dev",
  "https://ario.permagate.io",
] as const;

export function resolveMetadataUriCandidates(uri: string): string[] {
  const trimmed = uri.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) {
    return [trimmed];
  }

  if (trimmed.startsWith("ar://")) {
    const txId = trimmed.slice("ar://".length).trim();
    if (!txId) return [];
    return ARWEAVE_GATEWAYS.map((gw) => `${gw}/${txId}`);
  }

  if (trimmed.startsWith("ipfs://")) {
    const path = trimmed
      .slice("ipfs://".length)
      .replace(/^ipfs\//, "")
      .trim();
    if (!path) return [];
    return [`https://ipfs.io/ipfs/${path}`];
  }

  return [];
}

/** Resolve ar://, ipfs://, or https metadata URIs to a fetchable HTTPS URL. */
export function resolveMetadataUri(uri: string): string | undefined {
  return resolveMetadataUriCandidates(uri)[0];
}

/** Resolve image (or other media) fields that may be ar:// / ipfs:// / https. */
export function resolveMetadataMediaUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return resolveMetadataUri(trimmed) ?? (trimmed.startsWith("http") ? trimmed : undefined);
}
