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
  VITE_ZERODEV_PROJECT_ID: import.meta.env.VITE_ZERODEV_PROJECT_ID,
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

/**
 * ZeroDev 的 bundler / paymaster 是同一个 endpoint，同一个 project id 在所有
 * 链上通用，链由 URL 里的 chain id 决定 —— 所以一个变量就够，不必每条链配一
 * 个 URL。（此前 mainnet 走 Pimlico、另两条走 ZeroDev，是迁移做了一半留下的。）
 *
 * `selfFunded=true`：不走 ZeroDev 的余额，由我们自己的 paymaster 存款付。
 */
const zeroDevUrl = (chainId: number, projectId: string): string =>
  `https://rpc.zerodev.app/api/v3/${projectId}/chain/${chainId}?selfFunded=true`;

interface ChainCandidate {
  chain: Chain;
  /** 是否为这条链代付 gas。只有 Optimism 充了 paymaster 存款。 */
  sponsored: boolean;
}

const CANDIDATES: ChainCandidate[] = [
  { chain: mainnet, sponsored: false },
  { chain: optimism, sponsored: true },
  { chain: sepolia, sponsored: false },
];

function buildChains(): ChainConfig[] {
  const apiKey = env("VITE_ALCHEMY_API_KEY");
  if (!apiKey) return [];
  const projectId = env("VITE_ZERODEV_PROJECT_ID");

  return CANDIDATES.filter((c) => ALCHEMY_NETWORK[c.chain.id]).map((c) => {
    const bundlerUrl = projectId ? zeroDevUrl(c.chain.id, projectId) : undefined;
    return {
      chain: c.chain,
      rpcUrl: alchemyRpcUrl(c.chain.id, apiKey),
      bundlerUrl,
      // 同一个 endpoint 既是 bundler 又是 paymaster；给不代付的链留空，
      // ctx.canSponsorGas 就是由它决定的。
      paymasterUrl: c.sponsored ? bundlerUrl : undefined,
      // gasPriceUrl 留空：semi-core 会去问 bundler，那才是决定这笔 UserOp
      // 收不收的一方。ZeroDev 对 pimlico_getUserOperationGasPrice 和
      // zd_getUserOperationGasPrice 返回相同结果，所以沿用默认方法名。
    };
  });
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
 * 给需要自建 viem transport 的地方用（server/utils/badge_wallet.ts）。
 *
 * 缺 key 时这里抛错，而不是静默退回 viem 内置的公共节点——公共节点有速率
 * 限制，而调用方是管理员签名的 badge 铸造。
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
