import { mainnet, optimism, sepolia } from "viem/chains";
import { createSemiCore, type ChainConfig } from "semi-core";

/**
 * 读环境变量。
 *
 * 客户端由 Vite 在构建期把 import.meta.env.VITE_* 静态替换掉；
 * Nitro 服务端则是运行时读 process.env——所以两边都要看。
 * 服务端用到的每个 VITE_* 都必须出现在 ginger.yml 的 secrets.inject 里。
 */
const env = (key: string): string | undefined => {
  // Nitro 产物里 import.meta.env 不一定存在，取值前先确认
  const viteEnv = import.meta.env as Record<string, string | undefined> | undefined;
  const fromVite = viteEnv?.[key];
  if (fromVite) return fromVite;
  if (typeof process !== "undefined" && process.env) return process.env[key];
  return undefined;
};

/** 拼 URL 前先确认每一段都在，缺了就说清楚缺的是哪个变量 */
const join = (...parts: (readonly [name: string, value: string | undefined])[]): string => {
  const missing = parts.filter(([, v]) => !v).map(([n]) => n);
  if (missing.length > 0) {
    throw new Error(`Missing environment variable(s): ${missing.join(", ")}`);
  }
  return parts.map(([, v]) => v!.replace(/\/+$/, "")).join("/");
};

const infuraKey = () => env("VITE_INFURA_API_KEY");

/**
 * 只有配齐 rpcUrl 的链才会被加进来。少配一条链会让那条链不可用，
 * 但不该让整个应用起不来——SUPPORTED_CHAINS 目前也只有 Optimism。
 */
function buildChains(): ChainConfig[] {
  const candidates: {
    chain: ChainConfig["chain"];
    rpc: string;
    bundler?: string;
    paymaster?: string;
  }[] = [
    { chain: mainnet, rpc: "VITE_MAINNET_RPC_URL", bundler: "VITE_MAINNET_BUNDLER_URL" },
    {
      chain: optimism,
      rpc: "VITE_OP_RPC_URL",
      bundler: "VITE_OP_BUNDLER_URL",
      paymaster: "VITE_OP_PAYMASTER",
    },
    { chain: sepolia, rpc: "VITE_SEPOLIA_RPC_URL", bundler: "VITE_SEPOLIA_BUNDLER_URL" },
  ];

  const configured: ChainConfig[] = [];
  for (const c of candidates) {
    const base = env(c.rpc);
    if (!base || !infuraKey()) continue;
    const paymaster = c.paymaster ? env(c.paymaster) : undefined;
    configured.push({
      chain: c.chain,
      rpcUrl: join([c.rpc, base], ["VITE_INFURA_API_KEY", infuraKey()]),
      bundlerUrl: c.bundler ? env(c.bundler) : undefined,
      paymasterUrl: paymaster || undefined,
      // gasPriceUrl 留空：semi-core 会去问 bundler，那才是决定这笔 UserOp
      // 收不收的一方。原来这里指向 Pimlico，而 bundler 是 ZeroDev。
    });
  }
  return configured;
}

const REQUIRED_HINT = ["VITE_INFURA_API_KEY", "VITE_OP_RPC_URL", "VITE_OP_BUNDLER_URL"].join(", ");

let instance: ReturnType<typeof createSemiCore> | undefined;

/** 惰性构造：让配置错误在第一次用到链的时候抛，而不是在模块加载时 */
export function semiCore() {
  if (instance) return instance;
  const chains = buildChains();
  if (chains.length === 0) {
    // 服务端最常见的原因是 ginger.yml 的 secrets.inject 漏了变量，
    // 说清楚要找什么，别让人对着 "requires at least one chain" 猜。
    throw new Error(
      `No chain is configured — semi-core cannot start. Check that these reach the runtime: ${REQUIRED_HINT}`
    );
  }
  instance = createSemiCore({ chains });
  return instance;
}

export const chainContext = (chainId: number) => semiCore().chain(chainId);
