export type MusicNftKind = "ripples-score";

export interface MusicNftCollection {
  chainId: number;
  contractAddress: `0x${string}`;
  kind: MusicNftKind;
  tokenStandard: "ERC721" | "ERC1155";
  defaultPlayUrl: (tokenId: string) => string;
  validatePlayUrl: (url: string, tokenId: string) => boolean;
}

const RIPPLES_SCORE_OPTIMISM: MusicNftCollection = {
  chainId: 10,
  contractAddress: "0xAc3F7471A4e1f5952b4c8f56521af46d6c20A4AA",
  kind: "ripples-score",
  tokenStandard: "ERC721",
  defaultPlayUrl: (tokenId) => `https://pond-ripple.xyz/score/${tokenId}`,
  validatePlayUrl: (url, tokenId) => {
    try {
      const pathname = new URL(url).pathname.replace(/\/+$/, "") || "/";
      return pathname === `/score/${tokenId}`;
    } catch {
      return false;
    }
  },
};

/** Static registry — extend with more collections as needed. */
export const MUSIC_NFT_COLLECTIONS: MusicNftCollection[] = [RIPPLES_SCORE_OPTIMISM];

export function getMusicCollection(
  chainId: number,
  contractAddress: string
): MusicNftCollection | undefined {
  const normalized = contractAddress.toLowerCase();
  return MUSIC_NFT_COLLECTIONS.find(
    (c) => c.chainId === chainId && c.contractAddress.toLowerCase() === normalized
  );
}

export function resolveMusicPlayUrl(
  collection: MusicNftCollection,
  tokenId: string,
  externalUrl?: string
): string {
  if (externalUrl && collection.validatePlayUrl(externalUrl, tokenId)) {
    return externalUrl;
  }
  return collection.defaultPlayUrl(tokenId);
}
