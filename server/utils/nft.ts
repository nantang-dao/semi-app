import type { Chain } from "viem";
import { Alchemy, Network } from "alchemy-sdk";

// 网络映射配置
const CHAIN_TO_NETWORK: Record<number, Network> = {
  1: Network.ETH_MAINNET,
  10: Network.OPT_MAINNET,
  11155111: Network.ETH_SEPOLIA,
};

// 获取 Alchemy 实例（服务器端）
const getAlchemyInstance = (chain: Chain): Alchemy => {
  const network = CHAIN_TO_NETWORK[chain.id];
  if (!network) {
    throw new Error(`Unsupported chain ID: ${chain.id}`);
  }

  return new Alchemy({
    apiKey: process.env.VITE_ALCHEMY_API_KEY || process.env.ALCHEMY_API_KEY,
    network,
  });
};

export interface NFT {
  contractAddress: string;
  tokenId: string;
  name: string;
  description?: string;
  image?: string;
  tokenType: "ERC721" | "ERC1155";
  collectionName?: string;
}

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
  try {
    const alchemy = getAlchemyInstance(chain);

    const allNFTs: NFT[] = [];
    let pageKey: string | undefined = undefined;

    do {
      const response = await alchemy.nft.getNftsForOwner(walletAddress, {
        pageSize: 100,
        pageKey,
      });

      // 处理ERC721和ERC1155
      for (const nft of response.ownedNfts) {
        const nftData: NFT = {
          contractAddress: nft.contract.address,
          tokenId: nft.tokenId,
          name: nft.name || nft.contract.name || `#${nft.tokenId}`,
          description: nft.description,
          image: nft.image?.originalUrl || nft.image?.pngUrl || nft.image?.cachedUrl,
          tokenType: nft.tokenType === "ERC1155" ? "ERC1155" : "ERC721",
          collectionName: nft.contract.name,
        };

        allNFTs.push(nftData);
      }

      pageKey = response.pageKey;
    } while (pageKey);

    return allNFTs;
  } catch (error) {
    console.error("Error fetching NFTs:", error);
    throw new Error("Failed to fetch NFTs");
  }
}
