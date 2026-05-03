import type { Chain } from "viem";

export interface NFT {
  contractAddress: string;
  tokenId: string;
  name: string;
  description?: string;
  image?: string;
  tokenType: "ERC721" | "ERC1155";
  collectionName?: string;
  attributes?: Record<string,any>;
  rawMetadata?:any;
}

const CHAIN_TO_NETWORK: Record<number, string> = {
  1: "eth-mainnet",
  10: "opt-mainnet",
  11155111: "eth-sepolia",
};

/**
 * 获取用户拥有的NFT
 * @param walletAddress 钱包地址
 * @param chain 链配置
 * @returns NFT列表
 */
export async function getOwnedNFTs(
  walletAddress: string,
  chain: Chain
): Promise<NFT[]> {
  const network = CHAIN_TO_NETWORK[chain.id];
  if (!network) {
    throw new Error(`Unsupported chain ID: ${chain.id}`);
  }

  // Dynamic import so alchemy-sdk is not loaded at Lambda cold start
  const { Alchemy, Network } = await import("alchemy-sdk");
  const networkMap: Record<string, typeof Network[keyof typeof Network]> = {
    "eth-mainnet": Network.ETH_MAINNET,
    "opt-mainnet": Network.OPT_MAINNET,
    "eth-sepolia": Network.ETH_SEPOLIA,
  };

  const alchemy = new Alchemy({
    apiKey: process.env.VITE_ALCHEMY_API_KEY || process.env.ALCHEMY_API_KEY,
    network: networkMap[network],
  });

  try {
    const allNFTs: NFT[] = [];
    let pageKey: string | undefined = undefined;

    do {
      const response = await alchemy.nft.getNftsForOwner(walletAddress, {
        pageSize: 100,
        pageKey,
      });

      for (const nft of response.ownedNfts) {
        let fullMetadata = null;
        let attributes: Record<string,any> | undefined = undefined;

        try {
          const metadataResponse = await alchemy.nft.getNftMetadata(
            nft.contract.address,
            nft.tokenId
          );
          fullMetadata = metadataResponse.raw;

          if (metadataResponse.raw?.metadata) {
            const metadata = metadataResponse.raw.metadata;
            if (metadata.attributes) {
              if (Array.isArray(metadata.attributes)) {
                attributes = {};
                metadata.attributes.forEach((attr: any) => {
                  if (attr.trait_type && attr.value !== undefined) {
                    attributes![attr.trait_type] = attr.value;
                  }
                });
              } else if (typeof metadata.attributes === "object") {
                attributes = metadata.attributes;
              }
            }
          }
        } catch (error) {
          console.warn(`Failed to fetch full metadata for ${nft.contract.address}/${nft.tokenId}:`, error);
        }

        allNFTs.push({
          contractAddress: nft.contract.address,
          tokenId: nft.tokenId,
          name: nft.name || nft.contract.name || `#${nft.tokenId}`,
          description: nft.description,
          image: nft.image?.originalUrl || nft.image?.pngUrl || nft.image?.cachedUrl,
          tokenType: nft.tokenType === "ERC1155" ? "ERC1155" : "ERC721",
          collectionName: nft.contract.name,
          attributes,
          rawMetadata: fullMetadata,
        });
      }

      pageKey = response.pageKey;
    } while (pageKey);

    return allNFTs;
  } catch (error) {
    console.error("Error fetching NFTs:", error);
    throw new Error("Failed to fetch NFTs");
  }
}
