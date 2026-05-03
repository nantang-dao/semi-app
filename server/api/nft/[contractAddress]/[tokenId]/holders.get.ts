import { sepolia, optimism, mainnet } from "viem/chains";

const chains = {
  "11155111": sepolia,
  "1": mainnet,
  "10": optimism,
} as const;

const CHAIN_TO_NETWORK: Record<number, string> = {
  1: "eth-mainnet",
  10: "opt-mainnet",
  11155111: "eth-sepolia",
};

export default defineEventHandler(async (event) => {
  const params = getRouterParams(event);
  const query = getQuery(event);
  const { contractAddress, tokenId } = params;
  const { chain_id } = query;

  if (!chain_id || !chains[chain_id as keyof typeof chains]) {
    return { success: false, message: "无效的链ID", data: { holders: [] } };
  }

  try {
    const chain = chains[chain_id as keyof typeof chains];
    // Dynamic import so alchemy-sdk is not loaded at Lambda cold start
    const { Alchemy, Network } = await import("alchemy-sdk");
    const networkMap: Record<string, typeof Network[keyof typeof Network]> = {
      "eth-mainnet": Network.ETH_MAINNET,
      "opt-mainnet": Network.OPT_MAINNET,
      "eth-sepolia": Network.ETH_SEPOLIA,
    };
    const alchemy = new Alchemy({
      apiKey: process.env.VITE_ALCHEMY_API_KEY || process.env.ALCHEMY_API_KEY,
      network: networkMap[CHAIN_TO_NETWORK[chain.id]],
    });

    // 获取持有者（主要用于 ERC1155）
    const owners = await alchemy.nft.getOwnersForNft(contractAddress, tokenId);

    const holders = owners.owners.map((owner: string) => ({
      address: owner,
      quantity: "1", // ERC721 固定为 1，ERC1155 需要额外查询数量
    }));

    return {
      success: true,
      data: { holders },
    };
  } catch (error) {
    console.error("获取持有者失败:", error);
    return {
      success: false,
      message: "获取持有者失败",
      data: { holders: [] },
    };
  }
});