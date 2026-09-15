import { getOwnedNFTs } from "@/server/utils/nft";
import { SERVER_CHAINS } from "@/server/utils/chains";

const chains = SERVER_CHAINS;

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