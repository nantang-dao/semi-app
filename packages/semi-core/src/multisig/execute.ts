import type { Hex } from "viem";
import { ENTRY_POINT_07_ADDRESS } from "../chains";
import type { ChainContext } from "../config";
import {
  BundlerError,
  PaymasterExpiredError,
  SnapshotExpiredError,
  SnapshotHashMismatchError,
} from "../errors";
import { packMultisigSignatures, safeOpHash } from "./sign";
import { assertValidSnapshot, type CollectedSignature, type UserOpSnapshot } from "./types";

const toHexNum = (n: string): Hex => `0x${BigInt(n).toString(16)}`;

interface UserOpReceipt {
  receipt?: { transactionHash?: Hex };
  actualGasCost?: string;
  success?: boolean;
}

export interface ExecuteResult {
  userOpHash: Hex;
  txHash: Hex;
  /** paymaster 实际付掉的 wei，后端据此给执行者记账 */
  actualGasCost: bigint;
}

async function bundlerRpc(
  url: string,
  method: string,
  params: unknown[]
): Promise<{ result?: unknown; error?: { message?: string } }> {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
  });
  return (await resp.json()) as { result?: unknown; error?: { message?: string } };
}

/** ERC-4337 错误码 → 说得清原因的提示 */
const AA_HINTS: Record<string, string> = {
  AA33: "paymaster validatePaymasterUserOp reverted — the sponsorship expired or its policy rejected this operation",
  AA25: "invalid nonce — a concurrent transaction changed the Safe's nonce, the transaction must be re-proposed",
  AA23: "the account's validateUserOp reverted — usually a signature that does not match the signed SafeOp hash",
  AA24: "signature error — the collected signatures do not satisfy the Safe's threshold or owner set",
};

/**
 * 提交收齐签名的多签 UserOp，等回执。
 *
 * 走原始 RPC 而非 viem 的 sendUserOperation：签名是外部收集好的，不需要
 * 也不能让客户端再签一次。
 */
export async function executeMultisigUserOp(
  ctx: ChainContext,
  snapshot: UserOpSnapshot,
  signatures: CollectedSignature[],
  threshold: number,
  options?: { maxAttempts?: number; intervalMs?: number }
): Promise<ExecuteResult> {
  assertValidSnapshot(snapshot);

  if (snapshot.chainId !== ctx.chainId) {
    throw new BundlerError(
      `This snapshot was built for chain ${snapshot.chainId} but is being executed against ` +
        `chain ${ctx.chainId}. The collected signatures commit to chain ${snapshot.chainId}.`
    );
  }

  // 收齐的签名承诺的是这份快照。提交前重算一次哈希：不一致说明快照在收签
  // 期间被改过，那些签名对现在这份内容是无效的（链上会以 AA24 拒绝），
  // 与其烧掉一次 gas 换一个难懂的错，不如在这里说清楚。
  if (snapshot.safeOpHash) {
    const actual = safeOpHash(snapshot);
    if (snapshot.safeOpHash.toLowerCase() !== actual.toLowerCase()) {
      throw new SnapshotHashMismatchError(snapshot.safeOpHash, actual, "recorded in the snapshot");
    }
  }

  const bundlerUrl = ctx.bundlerUrl;
  if (!bundlerUrl) throw new BundlerError(`No bundler configured for chain ${ctx.chainId}`);

  const nowSec = Math.floor(Date.now() / 1000);

  // 1) Semi 自己的收签窗口（见 SNAPSHOT_VALIDITY_SECONDS）。
  //    旧快照没有这个字段，按不过期处理。
  if (snapshot.expiresAt && nowSec >= snapshot.expiresAt) {
    throw new SnapshotExpiredError(snapshot.expiresAt);
  }

  // 2) paymaster 自己签的有效期。多数情况是 0（不过期），届时跳过。
  //    提前拦下来，好过让 bundler 抛一个难懂的 AA33。
  if (snapshot.paymasterValidUntil && nowSec >= snapshot.paymasterValidUntil) {
    throw new PaymasterExpiredError(snapshot.paymasterValidUntil);
  }

  // 放在所有本地检查之后：这一步要发网络请求，而上面那些不用。先把能就地
  // 判定的错报出来，别让「提案过期了」变成一个 HTTP 超时。
  await ctx.assertChainId();

  const userOp: Record<string, string> = {
    sender: snapshot.sender,
    nonce: toHexNum(snapshot.nonce),
    callData: snapshot.callData,
    callGasLimit: toHexNum(snapshot.callGasLimit),
    verificationGasLimit: toHexNum(snapshot.verificationGasLimit),
    preVerificationGas: toHexNum(snapshot.preVerificationGas),
    maxFeePerGas: toHexNum(snapshot.maxFeePerGas),
    maxPriorityFeePerGas: toHexNum(snapshot.maxPriorityFeePerGas),
    signature: packMultisigSignatures(
      signatures,
      threshold,
      snapshot.validAfter,
      snapshot.validUntil
    ),
  };

  if (snapshot.factory && snapshot.factoryData) {
    userOp.factory = snapshot.factory;
    userOp.factoryData = snapshot.factoryData;
  }

  // v0.7 的拆开字段，必须对应签名承诺的那份 paymasterAndData
  if (snapshot.paymaster) {
    userOp.paymaster = snapshot.paymaster;
    userOp.paymasterData = snapshot.paymasterData ?? "0x";
    userOp.paymasterVerificationGasLimit = toHexNum(snapshot.paymasterVerificationGasLimit ?? "0");
    userOp.paymasterPostOpGasLimit = toHexNum(snapshot.paymasterPostOpGasLimit ?? "0");
  }

  const sent = await bundlerRpc(bundlerUrl, "eth_sendUserOperation", [
    userOp,
    ENTRY_POINT_07_ADDRESS,
  ]);

  if (sent.error) {
    const message = sent.error.message || JSON.stringify(sent.error);
    const aaCode = message.match(/\bAA\d{2}\b/)?.[0];
    const hint = aaCode && AA_HINTS[aaCode] ? ` (${aaCode}: ${AA_HINTS[aaCode]})` : "";
    throw new BundlerError(`Bundler rejected the UserOperation: ${message}${hint}`, aaCode);
  }

  const userOpHash = sent.result as Hex;
  ctx.logger.debug("Multisig UserOperation submitted", { userOpHash });

  const receipt = await pollForUserOpReceipt(ctx, bundlerUrl, userOpHash, options);

  let actualGasCost = 0n;
  try {
    if (receipt.actualGasCost) actualGasCost = BigInt(receipt.actualGasCost);
  } catch {
    actualGasCost = 0n;
  }

  return {
    userOpHash,
    txHash: receipt.receipt?.transactionHash as Hex,
    actualGasCost,
  };
}

async function pollForUserOpReceipt(
  ctx: ChainContext,
  bundlerUrl: string,
  userOpHash: Hex,
  { maxAttempts = 60, intervalMs = 3000 }: { maxAttempts?: number; intervalMs?: number } = {}
): Promise<UserOpReceipt> {
  for (let i = 0; i < maxAttempts; i++) {
    const data = await bundlerRpc(bundlerUrl, "eth_getUserOperationReceipt", [userOpHash]);
    if (data.result) return data.result as UserOpReceipt;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new BundlerError(
    `Timed out after ${(maxAttempts * intervalMs) / 1000}s waiting for the receipt of ${userOpHash}. The operation may still land — check the bundler before re-proposing.`
  );
}
