import { mainnet, optimism, sepolia, type Chain } from "viem/chains";
import { createSemiCore, type ChainConfig } from "semi-core";

/**
 * 客户端要用的环境变量，**逐个静态列出**。
 *
 * 必须是 `import.meta.env.VITE_X` 这样的字面访问：Vite 只替换它实际看到的
 * 表达式。写成 `import.meta.env[key]` 这种动态取值，Vite 会把整个 env 对象
 * 序列化进 bundle，于是 .env 里每一个 VITE_* 都被打包进去——包括早就不用的
 * 和别处才需要的。
 */
const VITE_ENV: Record<string, string | undefined> = {
  VITE_ALCHEMY_API_KEY: import.meta.env.VITE_ALCHEMY_API_KEY,
  VITE_MAINNET_BUNDLER_URL: import.meta.env.VITE_MAINNET_BUNDLER_URL,
  VITE_OP_BUNDLER_URL: import.meta.env.VITE_OP_BUNDLER_URL,
  VITE_SEPOLIA_BUNDLER_URL: import.meta.env.VITE_SEPOLIA_BUNDLER_URL,
  VITE_OP_PAYMASTER: import.meta.env.VITE_OP_PAYMASTER,
};

/**
 * 客户端由 Vite 在构建期内联上面那张表；Nitro 服务端则是运行时读
 * process.env —— 所以两边都要看。服务端用到的每个 VITE_* 都必须出现在
 * ginger.yml 的 secrets.inject 里。
 */
const env = (key: keyof typeof VITE_ENV | string): string | undefined => {
  const fromVite = VITE_ENV[key];
  if (fromVite) return fromVite;
  if (typeof process !== "undefined" && process.env) return process.env[key];
  return undefined;
};

/**
 * Alchemy 的 RPC 主机名是按链固定的，所以只需要一个 API key，不必再为每条链
 * 配一个 URL —— 少三个可以配错、配漏的变量。同一个 key 也用于 Alchemy 的
 * 索引 API（转账历史、NFT 持有者），那部分在 utils/actions.ts。
 */
const ALCHEMY_NETWORK: Record<number, string> = {
  [mainnet.id]: "eth-mainnet",
  [optimism.id]: "opt-mainnet",
  [sepolia.id]: "eth-sepolia",
};

const alchemyRpcUrl = (chainId: number, apiKey: string): string =>
  `https://${ALCHEMY_NETWORK[chainId]}.g.alchemy.com/v2/${apiKey}`;

interface ChainCandidate {
  chain: Chain;
  bundlerEnv: string;
  paymasterEnv?: string;
}

const CANDIDATES: ChainCandidate[] = [
  { chain: mainnet, bundlerEnv: "VITE_MAINNET_BUNDLER_URL" },
  { chain: optimism, bundlerEnv: "VITE_OP_BUNDLER_URL", paymasterEnv: "VITE_OP_PAYMASTER" },
  { chain: sepolia, bundlerEnv: "VITE_SEPOLIA_BUNDLER_URL" },
];

function buildChains(): ChainConfig[] {
  const apiKey = env("VITE_ALCHEMY_API_KEY");
  if (!apiKey) return [];

  return CANDIDATES.filter((c) => ALCHEMY_NETWORK[c.chain.id]).map((c) => ({
    chain: c.chain,
    rpcUrl: alchemyRpcUrl(c.chain.id, apiKey),
    bundlerUrl: env(c.bundlerEnv),
    paymasterUrl: c.paymasterEnv ? env(c.paymasterEnv) || undefined : undefined,
    // gasPriceUrl 留空：semi-core 会去问 bundler，那才是决定这笔 UserOp
    // 收不收的一方。
  }));
}

let instance: ReturnType<typeof createSemiCore> | undefined;

/** 惰性构造：让配置错误在第一次用到链的时候抛，而不是在模块加载时 */
export function semiCore() {
  if (instance) return instance;
  const chains = buildChains();
  if (chains.length === 0) {
    // 服务端最常见的原因是 ginger.yml 的 secrets.inject 漏了变量。
    throw new Error(
      "No chain is configured — semi-core cannot start. VITE_ALCHEMY_API_KEY is missing from the runtime environment."
    );
  }
  instance = createSemiCore({ chains });
  return instance;
}

export const chainContext = (chainId: number) => semiCore().chain(chainId);

/**
 * 给需要自建 viem/wagmi transport 的地方用（badge 的 wagmi client）。
 *
 * 那两处 wagmi client 是在模块加载时构造的，所以这里抛错会让整个模块导入
 * 失败。这是有意的：缺 key 时 semiCore() 一样起不来，与其让 badge 静默
 * 退回公共节点，不如当场说清楚缺什么。
 */
export const rpcUrlFor = (chainId: number): string => {
  const apiKey = env("VITE_ALCHEMY_API_KEY");
  if (!apiKey) {
    throw new Error(
      "VITE_ALCHEMY_API_KEY is missing — no JSON-RPC endpoint can be built. On the server it must be listed in ginger.yml secrets.inject."
    );
  }
  const network = ALCHEMY_NETWORK[chainId];
  if (!network) {
    throw new Error(`Chain ${chainId} has no Alchemy network mapping in utils/semi_core.ts`);
  }
  return alchemyRpcUrl(chainId, apiKey);
};
