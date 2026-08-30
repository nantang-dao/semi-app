import type { Address, Hex } from "viem";
import { ENTRY_POINT_07_ADDRESS } from "../chains";
import type { ChainContext } from "../config";

/** 7 天 —— 足够覆盖任何现实中的收签周期 */
const PAYMASTER_VALIDITY_SECONDS = 7 * 24 * 60 * 60;

export interface SponsorPaymasterFields {
  paymaster: Address;
  paymasterData: Hex;
  paymasterVerificationGasLimit: bigint;
  paymasterPostOpGasLimit: bigint;
  validUntil: number;
}

export interface SponsorshipUserOp {
  sender: Address;
  nonce: bigint;
  callData: Hex;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  factory?: Address | undefined;
  factoryData?: Hex | undefined;
}

const toHexBigInt = (n: bigint): Hex => `0x${n.toString(16)}`;

/**
 * 向 paymaster 申请赞助（ERC-7677 `pm_getPaymasterData`）。
 * 该链没配 paymaster 时返回 null；RPC 失败则抛错，由调用方决定是否退回自付。
 *
 * 注意：verifying paymaster 是对一个有效期窗口签名的。多签收签可能跨很长
 * 时间，赞助有可能在执行前就过期——那时必须重建快照（重新提案）。这是把
 * paymasterAndData 绑进签名内容的固有代价。
 */
export async function fetchSponsorPaymasterData(
  ctx: ChainContext,
  userOp: SponsorshipUserOp
): Promise<SponsorPaymasterFields | null> {
  const url = ctx.paymasterUrl;
  if (!url) return null;

  const validUntil = Math.floor(Date.now() / 1000) + PAYMASTER_VALIDITY_SECONDS;

  // 走原始 ERC-7677 RPC，**不用** viem 的 getPaymasterData：后者会从请求体里
  // 剥掉 paymasterVerificationGasLimit / paymasterPostOpGasLimit，而 ZeroDev 的
  // verifying paymaster 是对这两个字段签名的。提交上链的必须与请求时逐字节
  // 一致，否则重建出的哈希对不上，签名校验失败（AA34），或者 EntryPoint 给
  // paymaster 分配的 gas 不够（AA33）。自己控制请求体才能保证一致。
  const rpc = async (method: string, params: unknown[]): Promise<Record<string, string>> => {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
    });
    const j = (await r.json()) as { error?: { message?: string }; result?: Record<string, string> };
    if (j.error) throw new Error(`${method}: ${j.error.message || JSON.stringify(j.error)}`);
    return j.result ?? {};
  };

  const baseUserOp: Record<string, string> = {
    sender: userOp.sender,
    nonce: toHexBigInt(userOp.nonce),
    callData: userOp.callData,
    callGasLimit: toHexBigInt(userOp.callGasLimit),
    verificationGasLimit: toHexBigInt(userOp.verificationGasLimit),
    preVerificationGas: toHexBigInt(userOp.preVerificationGas),
    maxFeePerGas: toHexBigInt(userOp.maxFeePerGas),
    maxPriorityFeePerGas: toHexBigInt(userOp.maxPriorityFeePerGas),
  };
  if (userOp.factory && userOp.factoryData) {
    baseUserOp.factory = userOp.factory;
    baseUserOp.factoryData = userOp.factoryData;
  }

  const chainIdHex = toHexBigInt(BigInt(ctx.chainId));

  // 1. stub 调用告诉我们 paymaster 希望用多少 gas
  const stub = await rpc("pm_getPaymasterStubData", [
    baseUserOp,
    ENTRY_POINT_07_ADDRESS,
    chainIdHex,
    {},
  ]);
  if (!stub?.paymaster) return null;

  const pmVerGas = stub.paymasterVerificationGasLimit
    ? BigInt(stub.paymasterVerificationGasLimit)
    : 80_000n;
  const pmPostOpGas = stub.paymasterPostOpGasLimit ? BigInt(stub.paymasterPostOpGasLimit) : 20_000n;

  // 2. 用**将来实际提交的那组** gas limit 去换真正的签名数据
  const res = await rpc("pm_getPaymasterData", [
    {
      ...baseUserOp,
      paymasterVerificationGasLimit: toHexBigInt(pmVerGas),
      paymasterPostOpGasLimit: toHexBigInt(pmPostOpGas),
    },
    ENTRY_POINT_07_ADDRESS,
    chainIdHex,
    {},
  ]);
  if (!res?.paymaster) return null;

  return {
    paymaster: res.paymaster as Address,
    paymasterData: (res.paymasterData ?? "0x") as Hex,
    paymasterVerificationGasLimit: pmVerGas,
    paymasterPostOpGasLimit: pmPostOpGas,
    validUntil,
  };
}
