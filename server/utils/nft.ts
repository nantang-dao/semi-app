import type { Chain } from "viem";
import { getNftsForOwner, isAlchemySupportedChain } from "@/utils/alchemy";

export interface NFT {
  contractAddress: string;
  tokenId: string;
  name: string;
  description?: string;
  image?: string;
  tokenType: "ERC721" | "ERC1155";
  collectionName?: string;
  attributes?: Record<string, any>;
}

// Safety valve: 100 NFTs per page, so this caps a single request at 2000 NFTs.
// Without it a whale wallet would hold the Nitro handler open indefinitely.
const MAX_PAGES = 20;

/**
 * Alchemy returns attributes as either an array of {trait_type, value} or an
 * object map, depending on how the collection wrote its metadata. NFTItem
 * renders a flat key/value map, so normalize both shapes into one.
 */
function normalizeAttributes(metadata: any): Record<string, any> | undefined {
  const attributes = metadata?.attributes;
  if (!attributes) return undefined;

  if (Array.isArray(attributes)) {
    const map: Record<string, any> = {};
    for (const attr of attributes) {
      if (attr?.trait_type && attr.value !== undefined) {
        map[attr.trait_type] = attr.value;
      }
    }
    return Object.keys(map).length > 0 ? map : undefined;
  }

  return typeof attributes === "object" ? attributes : undefined;
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
    const allNFTs: NFT[] = [];
    let pageKey: string | undefined = undefined;
    let pages = 0;

    do {
      const response = await getNftsForOwner(chain.id, walletAddress, {
        pageSize: 100,
        pageKey,
      });

      for (const nft of response.ownedNfts) {
        // getNftsForOwner already returns metadata (omitMetadata defaults to
        // false), so `raw.metadata` is here — no per-NFT getNftMetadata needed.
        allNFTs.push({
          contractAddress: nft.contract.address,
          tokenId: nft.tokenId,
          name: nft.name || nft.contract.name || `#${nft.tokenId}`,
          description: nft.description,
          image: nft.image?.originalUrl || nft.image?.pngUrl || nft.image?.cachedUrl,
          tokenType: nft.tokenType === "ERC1155" ? "ERC1155" : "ERC721",
          collectionName: nft.contract.name,
          attributes: normalizeAttributes(nft.raw?.metadata),
        });
      }

      pageKey = response.pageKey;
      pages++;

      if (pageKey && pages >= MAX_PAGES) {
        console.warn(
          `getOwnedNFTs: stopped at ${MAX_PAGES} pages (${allNFTs.length} NFTs) for ${walletAddress} on chain ${chain.id}`
        );
        break;
      }
    } while (pageKey);

    return allNFTs;
  } catch (error) {
    console.error("Error fetching NFTs:", error);
    throw new Error("Failed to fetch NFTs");
  }
}
