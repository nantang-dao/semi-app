import { arbitrum, mainnet, optimism, sepolia } from "viem/chains";

/**
 * 服务端接口接受的 chain_id。此前 11 个路由各抄一份，加链时容易漏。
 * 注意：链在这里不代表该链上所有功能都可用——badge/profile 合约只部署在
 * OP 和 Sepolia（server/utils/solar_badge/contracts.ts）。
 */
export const SERVER_CHAINS = {
  "11155111": sepolia,
  "1": mainnet,
  "10": optimism,
  "42161": arbitrum,
} as const;

export const SUPPORTED_CHAIN_IDS = new Set(Object.keys(SERVER_CHAINS).map(Number));
