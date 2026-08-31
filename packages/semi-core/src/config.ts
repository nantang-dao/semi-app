import { createPublicClient, http, type Chain, type PublicClient, type Transport } from "viem";
import { ChainMismatchError, ChainNotConfiguredError, ConfigError } from "./errors";

export interface Logger {
  debug(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
}

const NOOP_LOGGER: Logger = { debug: () => {}, warn: () => {} };

export interface ChainConfig {
  chain: Chain;
  /** 只读查询用的 JSON-RPC 端点 */
  rpcUrl: string;
  /**
   * 覆盖默认的 http(rpcUrl) 传输层。用于 fallback、WebSocket，
   * 或者测试时注入一个不联网的 transport。留空即用 rpcUrl。
   */
  transport?: Transport;
  /** ERC-4337 bundler。不发 UserOp 就不需要。 */
  bundlerUrl?: string;
  /** ERC-7677 paymaster。不配则该链只能自付 gas。 */
  paymasterUrl?: string;
  /**
   * gas 价格端点。留空即用 bundlerUrl —— 价格本就该来自将要收这笔 UserOp
   * 的那个 bundler，因为决定收不收的是它。
   */
  gasPriceUrl?: string;
  /**
   * 取 gas 价格的 RPC 方法名。4337 生态在这件事上没有标准，各家自己定。
   * 默认 `pimlico_getUserOperationGasPrice` —— Pimlico 定义的，ZeroDev
   * 也实现了同名方法作为兼容（也可以用它自家的
   * `zd_getUserOperationGasPrice`，返回结构一样）。
   * 调不通时退回链上的 EIP-1559 估价。
   */
  gasPriceMethod?: string;
}

export interface SemiCoreConfig {
  chains: ChainConfig[];
  logger?: Logger;
}

/**
 * 逐项校验 URL。
 *
 * 特意单独检查字符串里的 "undefined"：宿主常把 URL 由几个环境变量拼起来，
 * 少注入一个就会拼出 `https://undefined/undefined` 这种东西。那样的配置
 * 一路带到运行时才炸，报错还指向别处。宁可在这里就停下。
 */
function validateUrl(value: string, chainId: number, field: string): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ConfigError(`chain ${chainId}: \`${field}\` is empty`);
  }
  if (value.includes("undefined") || value.includes("null")) {
    throw new ConfigError(
      `chain ${chainId}: \`${field}\` contains "undefined"/"null" (${value}) — ` +
        `an environment variable is probably missing where this URL was built`
    );
  }
  try {
    new URL(value);
  } catch {
    throw new ConfigError(`chain ${chainId}: \`${field}\` is not a valid URL (${value})`);
  }
}

/** 报错里只带主机名——RPC URL 的路径段通常就是 API key。 */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "the configured RPC";
  }
}

export interface ChainContext {
  readonly chain: Chain;
  readonly chainId: number;
  readonly publicClient: PublicClient<Transport, Chain>;
  readonly logger: Logger;
  /** 未配置时抛 PaymasterNotConfiguredError，不返回 undefined */
  readonly bundlerUrl: string | undefined;
  readonly paymasterUrl: string | undefined;
  readonly gasPriceUrl: string | undefined;
  readonly gasPriceMethod: string;
  /** 该链是否能代付 gas */
  readonly canSponsorGas: boolean;
  /**
   * 校验 RPC 真的连在 `chain.id` 这条链上，不一致抛 ChainMismatchError。
   *
   * 所有会签名或提交的入口都会先 await 它，调用方一般不必自己调。第一次
   * 发一次 `eth_chainId`，结果缓存在这个 context 上；失败不缓存，下次重试。
   *
   * 只查 RPC，不查 bundler：bundler 连错链会在 EntryPoint 那里直接拒收，
   * 报错是明确的；而 RPC 连错链没有任何一层会发现。
   */
  readonly assertChainId: () => Promise<void>;
}

export interface SemiCore {
  /** 已配置的链 id */
  readonly chainIds: number[];
  /** 取某条链的上下文。未配置则抛 ChainNotConfiguredError。 */
  chain(chainId: number): ChainContext;
  has(chainId: number): boolean;
}

/**
 * 构造 semi-core 的运行时上下文。
 *
 * 所有端点都在这里显式传入——包不去读宿主的环境变量，因为它不知道宿主
 * 用的是 Vite 还是 Nitro，也不该替宿主规定变量名。
 *
 * 配置在构造时就校验完，缺失和拼错的 URL 在启动时报错，而不是等到第一笔
 * 交易发出去。
 */
export function createSemiCore(config: SemiCoreConfig): SemiCore {
  if (!config?.chains?.length) {
    throw new ConfigError("createSemiCore requires at least one chain");
  }

  const logger = config.logger ?? NOOP_LOGGER;
  const contexts = new Map<number, ChainContext>();

  for (const entry of config.chains) {
    const chainId = entry.chain?.id;
    if (typeof chainId !== "number") {
      throw new ConfigError("每个 chains[] 条目都需要一个 viem 的 `chain` 对象");
    }
    if (contexts.has(chainId)) {
      throw new ConfigError(`chain ${chainId} is configured twice`);
    }

    validateUrl(entry.rpcUrl, chainId, "rpcUrl");
    if (entry.bundlerUrl !== undefined) validateUrl(entry.bundlerUrl, chainId, "bundlerUrl");
    if (entry.paymasterUrl !== undefined) validateUrl(entry.paymasterUrl, chainId, "paymasterUrl");
    if (entry.gasPriceUrl !== undefined) validateUrl(entry.gasPriceUrl, chainId, "gasPriceUrl");

    const publicClient = createPublicClient({
      chain: entry.chain,
      transport: entry.transport ?? http(entry.rpcUrl),
    }) as PublicClient<Transport, Chain>;

    // 只缓存成功的那一次：把一个 rejected promise 缓存下来，会让一次网络抖动
    // 永久毒化这个 context。
    let verified: Promise<void> | undefined;
    const assertChainId = (): Promise<void> => {
      verified ??= (async () => {
        const actual = await publicClient.getChainId();
        if (actual !== chainId) throw new ChainMismatchError(chainId, actual, hostOf(entry.rpcUrl));
      })().catch((error) => {
        verified = undefined;
        throw error;
      });
      return verified;
    };

    contexts.set(chainId, {
      chain: entry.chain,
      chainId,
      publicClient,
      logger,
      bundlerUrl: entry.bundlerUrl,
      paymasterUrl: entry.paymasterUrl,
      gasPriceUrl: entry.gasPriceUrl ?? entry.bundlerUrl,
      gasPriceMethod: entry.gasPriceMethod ?? "pimlico_getUserOperationGasPrice",
      canSponsorGas: Boolean(entry.paymasterUrl),
      assertChainId,
    });
  }

  return {
    chainIds: [...contexts.keys()],
    has: (chainId) => contexts.has(chainId),
    chain(chainId) {
      const ctx = contexts.get(chainId);
      if (!ctx) throw new ChainNotConfiguredError(chainId, [...contexts.keys()]);
      return ctx;
    },
  };
}
