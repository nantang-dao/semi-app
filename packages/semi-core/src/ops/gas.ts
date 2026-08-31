import type { ChainContext } from "../config";
import { GasEstimationError } from "../errors";

export interface GasPrice {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

export interface GasEstimate extends GasPrice {
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
}

/**
 * 单签 UserOp 的 verificationGasLimit 下限。
 *
 * 早先这里是无条件写死 600000、**覆盖** bundler 的估算值。改成取下限：
 * 估算值更大时用估算值，否则用这个兜底。低估会在链上以 AA23 失败，
 * 而高估的部分 EntryPoint 会退回，代价不对称。
 */
export const VERIFICATION_GAS_FLOOR = 600_000n;

/** 多签：每多一个签名者多 60k 验签开销 */
export const multisigVerificationGasLimit = (threshold: number): bigint =>
  BigInt(600_000 + Math.max(0, threshold - 1) * 60_000);

/**
 * 取 gas 价格。
 *
 * 优先问 bundler：它给的是**它自己愿意接受**的价格。链上 baseFee 只是链的
 * 状态，两者可以差很远，按后者出价会被 bundler 拒收。
 *
 * 问不到就退回链上的 EIP-1559 估价并记 warning —— 出一个可能被拒的价格，
 * 好过让整笔交易根本发不出去（原来这里是直接抛错）。
 */
export async function getUserOperationGasPrice(ctx: ChainContext): Promise<GasPrice> {
  if (ctx.gasPriceUrl) {
    try {
      return await fetchBundlerGasPrice(ctx.gasPriceUrl, ctx.gasPriceMethod);
    } catch (error) {
      ctx.logger.warn(
        `${ctx.gasPriceMethod} failed, falling back to the chain's EIP-1559 estimate`,
        error
      );
    }
  }

  const fees = await ctx.publicClient.estimateFeesPerGas();
  return {
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
  };
}

async function fetchBundlerGasPrice(url: string, method: string): Promise<GasPrice> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params: [], id: 1 }),
  });
  if (!response.ok) {
    throw new GasEstimationError(`${method} returned HTTP ${response.status}`);
  }
  const data = (await response.json()) as {
    error?: { message: string };
    result?: { standard?: { maxFeePerGas: string; maxPriorityFeePerGas: string } };
  };
  if (data.error) throw new GasEstimationError(`${method}: ${data.error.message}`);
  const standard = data.result?.standard;
  if (!standard?.maxFeePerGas || !standard.maxPriorityFeePerGas) {
    throw new GasEstimationError(`${method} returned no standard price`);
  }
  return {
    maxFeePerGas: BigInt(standard.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(standard.maxPriorityFeePerGas),
  };
}

export interface EstimateMultisigGasParams {
  account: unknown;
  calls: unknown[];
  threshold: number;
}

/**
 * 多签 UserOp 的 gas 估算。
 *
 * bundler 估不出来时（多签账户未部署、签名占位不被接受等）退回一组保守的
 * 默认值——多签流程里估算失败不该阻断提案，签名收齐前还有机会重建快照。
 */
export async function estimateMultisigGas(
  ctx: ChainContext,
  bundlerClient: {
    estimateUserOperationGas(args: Record<string, unknown>): Promise<{
      callGasLimit: bigint;
      verificationGasLimit: bigint;
      preVerificationGas: bigint;
    }>;
  },
  { account, calls, threshold }: EstimateMultisigGasParams
): Promise<GasEstimate> {
  const gasPrice = await getUserOperationGasPrice(ctx);

  let gas;
  try {
    gas = await bundlerClient.estimateUserOperationGas({
      account,
      calls,
      maxFeePerGas: gasPrice.maxFeePerGas,
      maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
    });
  } catch (error) {
    ctx.logger.warn("Multisig gas estimate failed, falling back to defaults", error);
    gas = {
      callGasLimit: 200_000n,
      preVerificationGas: 80_000n,
      verificationGasLimit: multisigVerificationGasLimit(threshold),
    };
  }

  return {
    ...gasPrice,
    ...gas,
    verificationGasLimit: multisigVerificationGasLimit(threshold),
  };
}
