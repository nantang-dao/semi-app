import { sepolia, optimism, mainnet } from "viem/chains";
import { getOwnedNFTs } from "@/server/utils/nft";

const chains = {
  "11155111": sepolia,
  "1": mainnet,
  "10": optimism,
} as const;

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const { chain_id, wallet_address } = query;

  if (!wallet_address || !chain_id) {
    return {
      success: false,
      message: "参数无效",
    };
  }

  if (!chains[chain_id as keyof typeof chains]) {
    return {
      success: false,
      message: "无效的链ID",
    };
  }

  const chain = chains[chain_id as keyof typeof chains];

  try {
    const nfts = await getOwnedNFTs(wallet_address as string, chain);

    return {
      success: true,
      message: "NFTs获取成功",
      data: {
        nfts,
      },
    };
  } catch (error) {
    console.error("获取NFTs失败:", error);
    return {
      success: false,
      message: "获取NFTs失败",
      data: {
        nfts: [],
      },
    };
  }
});