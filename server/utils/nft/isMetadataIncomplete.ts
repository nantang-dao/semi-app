/** Alchemy owned NFT shape (subset used for completeness checks). */
export interface AlchemyOwnedNftLike {
  name?: string | null;
  image?: {
    originalUrl?: string | null;
    pngUrl?: string | null;
    cachedUrl?: string | null;
  } | null;
  raw?: {
    metadata?: Record<string, unknown> | null;
  } | null;
}

function hasAlchemyImage(nft: AlchemyOwnedNftLike): boolean {
  const img = nft.image;
  if (!img) return false;
  return Boolean(img.originalUrl?.trim() || img.pngUrl?.trim() || img.cachedUrl?.trim());
}

function hasRawMetadata(nft: AlchemyOwnedNftLike): boolean {
  const meta = nft.raw?.metadata;
  if (!meta || typeof meta !== "object") return false;
  return Object.keys(meta).length > 0;
}

/**
 * Missing external_url alone does NOT make metadata incomplete (play URL uses music registry).
 */
export function isMetadataIncomplete(nft: AlchemyOwnedNftLike): boolean {
  if (!hasAlchemyImage(nft)) return true;
  if (!nft.name?.trim()) return true;
  if (!hasRawMetadata(nft)) return true;
  return false;
}
