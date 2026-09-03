import type { Chain } from "viem";
import { getNftsForOwner, isAlchemySupportedChain } from "@/utils/alchemy";
import { fetchChainMetadata, type FetchedChainMetadata } from "./nft/fetchChainMetadata";
import { getCachedMetadata, setCachedMetadata } from "./nft/metadataCache";
import { isMetadataIncomplete } from "./nft/isMetadataIncomplete";
import { normalizeAttributes, parseHttpExternalUrl } from "./nft/metadataHelpers";
import { getMusicCollection, resolveMusicPlayUrl } from "./nft/musicCollections";

export interface NFT {
  contractAddress: string;
  tokenId: string;
  name: string;
  description?: string;
  image?: string;
  tokenType: "ERC721" | "ERC1155";
  collectionName?: string;
  attributes?: Record<string, unknown>;
  rawMetadata?: unknown;
  /** Metadata external_url (http(s) only; not used for play button). */
  externalUrl?: string;
  isMusicNft?: boolean;
  musicKind?: string;
  /** Ripples play page; only set for registered music collections. */
  playUrl?: string;
}

/** Parse safe http(s) external_url from Alchemy raw metadata. */
export function resolveNftExternalUrl(rawMetadata: unknown): string | undefined {
  return parseHttpExternalUrl(rawMetadata);
}

// Safety valve: 100 NFTs per page, so this caps a single request at 2000 NFTs.
// Without it a whale wallet would hold the Nitro handler open indefinitely.
const MAX_PAGES = 20;
const ENRICH_CONCURRENCY = 2;
/** 补全最多覆盖这么多个 token，且整体不超过这个耗时——否则一个装满残缺 NFT
 *  的钱包就能把 /api/nft/owned 拖成分钟级请求。超出的按 Alchemy 原样返回。 */
const MAX_ENRICHED = 24;
const ENRICH_BUDGET_MS = 12_000;

interface AlchemyOwnedNft {
  contract: { address: string; name?: string | null };
  tokenId: string;
  name?: string | null;
  description?: string | null;
  image?: {
    originalUrl?: string | null;
    pngUrl?: string | null;
    cachedUrl?: string | null;
  } | null;
  tokenType?: string | null;
  raw?: { metadata?: Record<string, unknown> | null; tokenUri?: string | null } | null;
}

type PendingNft = { nft: NFT; alchemyNft: AlchemyOwnedNft };

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  const queue = [...items];
  const pool = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item) await worker(item);
    }
  });
  await Promise.all(pool);
}

function mapAlchemyNft(alchemyNft: AlchemyOwnedNft): NFT {
  return {
    contractAddress: alchemyNft.contract.address,
    tokenId: alchemyNft.tokenId,
    name: alchemyNft.name || alchemyNft.contract.name || `#${alchemyNft.tokenId}`,
    description: alchemyNft.description ?? undefined,
    image:
      alchemyNft.image?.originalUrl ||
      alchemyNft.image?.pngUrl ||
      alchemyNft.image?.cachedUrl ||
      undefined,
    tokenType: alchemyNft.tokenType === "ERC1155" ? "ERC1155" : "ERC721",
    collectionName: alchemyNft.contract.name ?? undefined,
    attributes: normalizeAttributes(alchemyNft.raw?.metadata),
    rawMetadata: alchemyNft.raw,
    externalUrl: resolveNftExternalUrl(alchemyNft.raw),
  };
}

async function enrichOne(
  chainId: number,
  nft: NFT,
  tokenUri?: string
): Promise<FetchedChainMetadata | null> {
  const cached = getCachedMetadata<FetchedChainMetadata>(chainId, nft.contractAddress, nft.tokenId);
  if (cached.hit) return cached.value;

  const meta = await fetchChainMetadata(chainId, nft.contractAddress, nft.tokenId, tokenUri);
  setCachedMetadata(chainId, nft.contractAddress, nft.tokenId, meta);
  return meta;
}

/**
 * 只有注册在 musicCollections 里的合约才做补全：播放入口和封面是这些 NFT 的
 * 核心 UX，值得多花一次 Alchemy refresh；其余 NFT 缺图就缺图，走 placeholder，
 * 不值得让整个列表请求为它们等待。
 */
async function enrichMetadata(pending: PendingNft[], chainId: number): Promise<void> {
  const toEnrich = pending
    .filter(
      ({ nft, alchemyNft }) =>
        nft.tokenType === "ERC721" &&
        getMusicCollection(chainId, nft.contractAddress) &&
        isMetadataIncomplete(alchemyNft)
    )
    .slice(0, MAX_ENRICHED);

  const deadline = Date.now() + ENRICH_BUDGET_MS;

  await runWithConcurrency(toEnrich, ENRICH_CONCURRENCY, async ({ nft, alchemyNft }) => {
    if (Date.now() >= deadline) return;
    try {
      const meta = await enrichOne(chainId, nft, alchemyNft.raw?.tokenUri ?? undefined);
      if (!meta) return;

      if (meta.name) nft.name = meta.name;
      if (meta.description) nft.description = meta.description;
      if (meta.image) nft.image = meta.image;
      if (meta.externalUrl) nft.externalUrl = meta.externalUrl;
      if (meta.attributes) nft.attributes = meta.attributes;
    } catch (err) {
      console.warn(
        `[getOwnedNFTs] metadata enrichment failed for ${nft.contractAddress}#${nft.tokenId}:`,
        err
      );
    }
  });
}

function applyMusicFields(nft: NFT, chainId: number): void {
  const collection = getMusicCollection(chainId, nft.contractAddress);
  if (!collection) {
    nft.isMusicNft = false;
    return;
  }

  nft.isMusicNft = true;
  nft.musicKind = collection.kind;
  nft.playUrl = resolveMusicPlayUrl(collection, nft.tokenId, nft.externalUrl);
}

/**
 * 获取用户拥有的NFT
 * @param walletAddress 钱包地址
 * @param chain 链配置
 * @returns NFT列表
 */
export async function getOwnedNFTs(walletAddress: string, chain: Chain): Promise<NFT[]> {
  if (!isAlchemySupportedChain(chain.id)) {
    throw new Error(`Unsupported chain ID: ${chain.id}`);
  }

  try {
    const pending: PendingNft[] = [];
    let pageKey: string | undefined;
    let pages = 0;

    for (;;) {
      const response = await getNftsForOwner(chain.id, walletAddress, {
        pageSize: 100,
        pageKey,
      });

      for (const alchemyNft of response.ownedNfts) {
        pending.push({
          nft: mapAlchemyNft(alchemyNft as AlchemyOwnedNft),
          alchemyNft: alchemyNft as AlchemyOwnedNft,
        });
      }

      pages++;
      if (!response.pageKey || pages >= MAX_PAGES) {
        if (response.pageKey && pages >= MAX_PAGES) {
          console.warn(
            `getOwnedNFTs: stopped at ${MAX_PAGES} pages (${pending.length} NFTs) for ${walletAddress} on chain ${chain.id}`
          );
        }
        break;
      }
      pageKey = response.pageKey;
    }

    await enrichMetadata(pending, chain.id);

    for (const { nft } of pending) {
      applyMusicFields(nft, chain.id);
    }

    return pending.map(({ nft }) => nft);
  } catch (error) {
    console.error("Error fetching NFTs:", error);
    throw new Error("Failed to fetch NFTs");
  }
}
