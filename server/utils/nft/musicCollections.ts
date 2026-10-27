export type MusicNftKind = "ripples-score" | "ripples-originals";

export interface MusicNftCollection {
  chainId: number;
  contractAddress: `0x${string}`;
  kind: MusicNftKind;
  tokenStandard: "ERC721" | "ERC1155";
  defaultPlayUrl: (tokenId: string) => string;
  validatePlayUrl: (url: string, tokenId: string) => boolean;
}

function pathnameOf(url: string): string | null {
  try {
    return new URL(url).pathname.replace(/\/+$/, "") || "/";
  } catch {
    return null;
  }
}

/** OP Score：`/score/{tokenId}`；ETH Score：`/score/{tokenId}/{contract}/{tokenId}` */
function ripplesScorePlay(
  chainId: number,
  contractAddress: `0x${string}`
): Pick<MusicNftCollection, "defaultPlayUrl" | "validatePlayUrl"> {
  const contractLower = contractAddress.toLowerCase();
  return {
    defaultPlayUrl: (tokenId) =>
      chainId === 1
        ? `https://pond-ripple.xyz/score/${tokenId}/${contractLower}/${tokenId}`
        : `https://pond-ripple.xyz/score/${tokenId}`,
    validatePlayUrl: (url, tokenId) => {
      const pathname = pathnameOf(url);
      if (!pathname) return false;
      if (pathname === `/score/${tokenId}`) return true;
      // 主网 Score：pathname 以 /score/{id}/ 开头，且带合约地址
      const prefix = `/score/${tokenId}/`;
      if (!pathname.toLowerCase().startsWith(prefix.toLowerCase())) return false;
      return pathname.toLowerCase().includes(contractLower);
    },
  };
}

/**
 * Originals（ERC1155 原曲）：默认指向合集页 /tracks。
 *
 * 校验**有意**放宽到「该站点的任意页面」：原曲播放页的具体路径不归我们控制，
 * 写死 /tracks 前缀会在对方改路由时把播放入口弄坏。这里真正要挡的是 metadata
 * 把播放按钮指向站外的钓鱼页，同源这一条就够了。
 */
function ripplesOriginalsPlay(): Pick<MusicNftCollection, "defaultPlayUrl" | "validatePlayUrl"> {
  return {
    defaultPlayUrl: () => "https://pond-ripple.xyz/tracks",
    validatePlayUrl: (url) => {
      const pathname = pathnameOf(url);
      if (!pathname) return false;
      if (pathname === "/" || pathname === "/tracks") return true;
      // 同源的其他页面也接受，理由见上
      try {
        return new URL(url).hostname === "pond-ripple.xyz";
      } catch {
        return false;
      }
    },
  };
}

function scoreCollection(
  chainId: number,
  contractAddress: `0x${string}`
): MusicNftCollection {
  return {
    chainId,
    contractAddress,
    kind: "ripples-score",
    tokenStandard: "ERC721",
    ...ripplesScorePlay(chainId, contractAddress),
  };
}

function originalsCollection(
  chainId: number,
  contractAddress: `0x${string}`
): MusicNftCollection {
  return {
    chainId,
    contractAddress,
    kind: "ripples-originals",
    tokenStandard: "ERC1155",
    ...ripplesOriginalsPlay(),
  };
}

/** Static registry — extend with more collections as needed. */
export const MUSIC_NFT_COLLECTIONS: MusicNftCollection[] = [
  // Score (ERC721) — jam / collaborative scores
  scoreCollection(10, "0xAc3F7471A4e1f5952b4c8f56521af46d6c20A4AA"),
  scoreCollection(1, "0xdeC99da00290d15f0742b0abd26e4Cd5d121f02A"),
  // Originals (ERC1155) — 35 track originals
  originalsCollection(10, "0xA65C9308635C8dd068A314c189e8d77941A7e99c"),
  originalsCollection(1, "0x6C731E5FAa26E648Cad6F86b1c1E741f0aaE136b"),
];

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
