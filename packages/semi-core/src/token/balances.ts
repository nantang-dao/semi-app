import { erc20Abi, type Address } from "viem";
import type { ChainContext } from "../config";

export interface Erc20BalanceResult {
  token: Address;
  balance: bigint;
  /** false 表示这个 token 的 balanceOf 调用失败，balance 是兜底的 0n */
  ok: boolean;
}

/** 原生币余额（ETH / OP 上的 ETH 等） */
export function getNativeBalance(ctx: ChainContext, address: Address): Promise<bigint> {
  return ctx.publicClient.getBalance({ address });
}

export function getErc20Balance(
  ctx: ChainContext,
  address: Address,
  token: Address
): Promise<bigint> {
  return ctx.publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  });
}

/**
 * 一次 multicall3 读完所有 token，而不是每个 token 一次 eth_call。
 *
 * allowFailure：单个坏 token（自毁的、不标准的）不该让整张余额列表崩掉，
 * 它只读成 0 并把 ok 标为 false，由调用方决定要不要提示。
 *
 * 只收地址、只回地址和余额——symbol / icon / decimals 这些元数据属于业务层，
 * 不进这个包。
 */
export async function getErc20Balances(
  ctx: ChainContext,
  address: Address,
  tokens: Address[]
): Promise<Erc20BalanceResult[]> {
  if (tokens.length === 0) return [];

  const results = await ctx.publicClient.multicall({
    allowFailure: true,
    contracts: tokens.map((token) => ({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: [address] as const,
    })),
  });

  return tokens.map((token, i) => {
    const result = results[i];
    if (!result || result.status === "failure") {
      ctx.logger.warn(`balanceOf failed for token ${token}`, result?.error);
      return { token, balance: 0n, ok: false };
    }
    return { token, balance: result.result as bigint, ok: true };
  });
}

/** 合约是否已部署到链上（Safe 部署前地址上没有字节码） */
export async function isDeployed(ctx: ChainContext, address: Address): Promise<boolean> {
  const code = await ctx.publicClient.getCode({ address });
  return Boolean(code && code !== "0x");
}

/** 读 ERC20 的 decimals。金额换算需要它，且应以合约为准而非后端元数据。 */
export function getErc20Decimals(ctx: ChainContext, token: Address): Promise<number> {
  return ctx.publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "decimals",
  });
}
