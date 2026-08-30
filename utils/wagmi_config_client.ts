import { createConfig } from "@wagmi/core";
import { mainnet, sepolia, optimism } from "viem/chains";
import { http } from "viem";
import { rpcUrlFor } from "~/utils/semi_core";

/**
 * 客户端的 wagmi client（badge 创建页在用）。
 *
 * 和 server/utils/wagmi_config.ts 一样，transports 要显式给 URL——原来是
 * 空的 `http()`，走的是公共节点而不是配置好的 Alchemy。
 */
export const client = createConfig({
  chains: [mainnet, sepolia, optimism],
  transports: {
    [mainnet.id]: http(rpcUrlFor(mainnet.id)),
    [sepolia.id]: http(rpcUrlFor(sepolia.id)),
    [optimism.id]: http(rpcUrlFor(optimism.id)),
  },
});
