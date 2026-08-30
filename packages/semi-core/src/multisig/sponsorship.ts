import type { Address, Hex } from "viem";
import { ENTRY_POINT_07_ADDRESS } from "../chains";
import type { ChainContext } from "../config";

/**
 * eth-infinitism VerifyingPaymaster（ZeroDev 用的就是这个）的 paymasterData 布局：
 *   abi.encode(uint48 validUntil, uint48 validAfter)  64 字节
 *   + ECDSA 签名                                        65 字节
 */
const VERIFYING_PAYMASTER_DATA_BYTES = 129;

export interface PaymasterValidity {
  /** unix 秒；0 表示不过期 */
  validUntil: number;
  validAfter: number;
}

/**
 * 从 paymasterData 里解出赞助的有效期窗口。
 *
 * 这个值以前是本地写死的「7 天」猜测——从来没发给过 paymaster，纯属假设。
 * 实测 ZeroDev 返回的 validUntil 是 0（不过期），于是那个假期限会在第 8 天
 * 拒掉一笔完全有效的交易，而此时所有签名已经收齐，只能作废重来。
 *
 * 布局不认识就返回 null，由调用方决定——**不要**退回一个猜出来的期限。
 * 误判过期的代价（丢掉已收集的全部签名）远大于漏判（提交后拿到一个
 * 说得清原因的 AA33）。
 */
export function parsePaymasterValidity(paymasterData: Hex): PaymasterValidity | null {
  const body = paymasterData.startsWith("0x") ? paymasterData.slice(2) : paymasterData;
  if (body.length !== VERIFYING_PAYMASTER_DATA_BYTES * 2) return null;

  const validUntil = Number(BigInt(`0x${body.slice(0, 64)}`));
  const validAfter = Number(BigInt(`0x${body.slice(64, 128)}`));

  // uint48 的上限；超出说明这不是我们认识的布局
  const UINT48_MAX = 281_474_976_710_655;
  if (validUntil > UINT48_MAX || validAfter > UINT48_MAX) return null;

  return { validUntil, validAfter };
}

export interface SponsorPaymasterFields {
  paymaster: Address;
  paymasterData: Hex;
  paymasterVerificationGasLimit: bigint;
  paymasterPostOpGasLimit: bigint;
  /**
   * 赞助失效的 unix 秒，从 paymasterData 里解出来的真实值。
   * 0 = 不过期，或布局不认识、无从判断。两种情况都不做本地预检查。
   */
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

  const paymasterData = (res.paymasterData ?? "0x") as Hex;
  const validity = parsePaymasterValidity(paymasterData);
  if (!validity) {
    ctx.logger.warn(
      "Unrecognised paymasterData layout — cannot tell when this sponsorship expires, so no local expiry check will be made",
      { bytes: (paymasterData.length - 2) / 2 }
    );
  }

  return {
    paymaster: res.paymaster as Address,
    paymasterData,
    paymasterVerificationGasLimit: pmVerGas,
    paymasterPostOpGasLimit: pmPostOpGas,
    validUntil: validity?.validUntil ?? 0,
  };
}
