import { createConfig } from "@wagmi/core";
import { mainnet, sepolia, optimism } from "viem/chains";
import { http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { rpcUrlFor } from "~/utils/semi_core";

/**
 * Badge 上链用的 wagmi client。
 *
 * transports 必须显式给 URL：`http()` 不带参数用的是 viem 内置的链默认端点
 * （OP 是公共的 mainnet.optimism.io），会绕过我们配置的 Alchemy，落到一个
 * 有速率限制的公共节点上。而这里跑的是管理员签名的 registerClass / mint,
 * 失败了用户就拿不到徽章。
 */
export const client = createConfig({
  chains: [mainnet, sepolia, optimism],
  transports: {
    [mainnet.id]: http(rpcUrlFor(mainnet.id)),
    [sepolia.id]: http(rpcUrlFor(sepolia.id)),
    [optimism.id]: http(rpcUrlFor(optimism.id)),
  },
});

export const admin_account = (chain_id: number) => {
  switch (chain_id) {
    case 11155111:
      return privateKeyToAccount(
        process.env.SEPOLIA_SOLA_BADGE_ADMIN_WALLET_PRIVATE_KEY as `0x${string}`
      );
    case 10:
      return privateKeyToAccount(
        process.env.OP_SOLA_BADGE_ADMIN_WALLET_PRIVATE_KEY as `0x${string}`
      );
    default:
      throw new Error("ACCOUNT_NOT_FOUND: Invalid chain id");
  }
};

export const wagmi_config = {
  client,
  admin_account,
};
