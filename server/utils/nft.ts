import type { Chain } from "viem";
import { getNftsForOwner, isAlchemySupportedChain } from "@/utils/alchemy";
import { fetchChainMetadata } from "./nft/fetchChainMetadata";
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
const CHAIN_ENRICH_CONCURRENCY = 2;

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
  raw?: { metadata?: Record<string, unknown> | null } | null;
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

async function enrichFromChain(pending: PendingNft[], chain: Chain): Promise<void> {
  const toEnrich = pending.filter(
    ({ nft, alchemyNft }) => nft.tokenType === "ERC721" && isMetadataIncomplete(alchemyNft)
  );

  // Music NFTs first — their Arweave metadata is what play/image UX depends on.
  toEnrich.sort((a, b) => {
    const am = a.nft.isMusicNft || getMusicCollection(chain.id, a.nft.contractAddress) ? 0 : 1;
    const bm = b.nft.isMusicNft || getMusicCollection(chain.id, b.nft.contractAddress) ? 0 : 1;
    return am - bm;
  });

  await runWithConcurrency(toEnrich, CHAIN_ENRICH_CONCURRENCY, async ({ nft }) => {
    try {
      const chainMeta = await fetchChainMetadata(chain, nft.contractAddress, nft.tokenId);
      if (!chainMeta) return;

      if (chainMeta.name) nft.name = chainMeta.name;
      if (chainMeta.description) nft.description = chainMeta.description;
      if (chainMeta.image) nft.image = chainMeta.image;
      if (chainMeta.externalUrl) nft.externalUrl = chainMeta.externalUrl;
      if (chainMeta.attributes) nft.attributes = chainMeta.attributes;
    } catch (err) {
      console.warn(
        `[getOwnedNFTs] chain metadata enrichment failed for ${nft.contractAddress}#${nft.tokenId}:`,
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

    await enrichFromChain(pending, chain);

    for (const { nft } of pending) {
      applyMusicFields(nft, chain.id);
    }

    return pending.map(({ nft }) => nft);
  } catch (error) {
    console.error("Error fetching NFTs:", error);
    throw new Error("Failed to fetch NFTs");
  }
}
