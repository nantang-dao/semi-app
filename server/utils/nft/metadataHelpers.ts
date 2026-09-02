/** Normalize OpenSea-style attributes to a flat map for NFTItem. */
export function normalizeAttributes(metadata: unknown): Record<string, unknown> | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const attributes = (metadata as Record<string, unknown>).attributes;
  if (!attributes) return undefined;

  if (Array.isArray(attributes)) {
    const map: Record<string, unknown> = {};
    for (const attr of attributes) {
      const item = attr as { trait_type?: string; value?: unknown };
      if (item?.trait_type && item.value !== undefined) {
        map[item.trait_type] = item.value;
      }
    }
    return Object.keys(map).length > 0 ? map : undefined;
  }

  if (typeof attributes === "object") {
    return attributes as Record<string, unknown>;
  }

  return undefined;
}

/** Parse http(s) external_url from flat JSON or Alchemy raw wrapper. */
export function parseHttpExternalUrl(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;

  const root = metadata as Record<string, unknown>;
  let url: unknown;

  if (root.metadata && typeof root.metadata === "object") {
    url = (root.metadata as Record<string, unknown>).external_url;
  } else {
    url = root.external_url;
  }

  if (typeof url !== "string") return undefined;
  const trimmed = url.trim();
  if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) {
    return trimmed;
  }
  return undefined;
}

export interface ChainMetadataJson {
  name?: string;
  description?: string;
  image?: string;
  external_url?: string;
  attributes?: unknown;
}

export function parseChainMetadataJson(json: unknown): ChainMetadataJson | null {
  if (!json || typeof json !== "object") return null;
  return json as ChainMetadataJson;
}
