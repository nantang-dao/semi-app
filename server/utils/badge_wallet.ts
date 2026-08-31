import { createWalletClient, createPublicClient, http, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, sepolia, optimism } from "viem/chains";
import { rpcUrlFor } from "~/utils/semi_core";

/**
 * Badge / profile 上链用的 viem wallet client。
 *
 * 原来这里是 `@wagmi/core` 的 createConfig + 一份 2600 行 wagmi codegen 包装
 * （167 个导出，实际只用到 3 个）。wagmi core 的 writeContract 在本地账户这条
 * 路径上就是转调 viem 的同名 action，所以直接用 viem 少一层依赖，行为不变。
 *
 * transport 必须显式给 URL：`http()` 不带参数用的是 viem 内置的链默认端点
 * （OP 是公共的 mainnet.optimism.io），会绕过我们配置的 Alchemy，落到一个
 * 有速率限制的公共节点上。而这里跑的是管理员签名的 registerClass / mint，
 * 失败了用户就拿不到徽章。
 */
const CHAINS: Record<number, Chain> = {
  [mainnet.id]: mainnet,
  [sepolia.id]: sepolia,
  [optimism.id]: optimism,
};

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

/**
 * 按链构造带管理员账户的 wallet client。链不支持时抛错，与之前一致。
 *
 * 刻意不标注成 `WalletClient`：那个宽泛类型会丢掉 account / chain 已绑定的
 * 信息，害得每个 writeContract 调用点都要补 `account` 和 `chain`（或者退化成
 * as any）。让它推断出具体类型，调用点就只写合约参数。
 */
export const badgeWalletClient = (chain_id: number) => {
  const chain = CHAINS[chain_id];
  if (!chain) throw new Error(`Unsupported chain ID: ${chain_id}`);
  return createWalletClient({
    account: admin_account(chain_id),
    chain,
    transport: http(rpcUrlFor(chain_id)),
  });
};

/**
 * 只读 client。accept 之前要问链上「这枚 token 是否已经存在」，那是一次
 * eth_call，不需要管理员私钥，也不该因为私钥没配就读不了。
 */
export const badgeReadClient = (chain_id: number) => {
  const chain = CHAINS[chain_id];
  if (!chain) throw new Error(`Unsupported chain ID: ${chain_id}`);
  return createPublicClient({ chain, transport: http(rpcUrlFor(chain_id)) });
};
