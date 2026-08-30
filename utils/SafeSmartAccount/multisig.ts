import { formatEther, type Address, type Chain, type Hex } from "viem";
import {
  buildMultisigUserOpSnapshot as coreBuildSnapshot,
  executeMultisigUserOp as coreExecute,
  signSafeOpSnapshot as coreSign,
  getSafeOwners as coreGetSafeOwners,
  getActualGasFee as coreGetActualGasFee,
  encodeAddOwner,
  encodeChangeThreshold,
  encodeRemoveOwner,
  encodeSwapOwner,
  packMultisigSignatures,
  estimateMultisigGas,
  SafeNotDeployedError,
  type BuildSnapshotParams,
  type CollectedSignature,
  type UserOpSnapshot,
} from "semi-core";
import { getVirtualSafeAccount } from "./account";
import { prepareClient } from "./prepareClient";
import { chainContext } from "~/utils/semi_core";

/**
 * semi-core/multisig 在 app 里的适配层。
 *
 * semi-core 收 ChainContext、返回 bigint；页面传的是 viem 的 chain、要的是
 * 已格式化的字符串。这一层只做这两件事的换算，不含业务逻辑。
 */

export type { UserOpSnapshot, CollectedSignature, BuildSnapshotParams };

export function buildMultisigUserOpSnapshot(params: {
  safeAddress: Address;
  owners: Address[];
  threshold: number;
  chain: Chain;
  calls: { to: Address; value?: bigint; data?: Hex }[];
  forcedNonce?: bigint;
  sponsorFee?: boolean;
}): Promise<UserOpSnapshot> {
  const { chain, ...rest } = params;
  return coreBuildSnapshot(chainContext(chain.id), rest);
}

/** 页面读的是 `signer`，semi-core 用的是后端字段名 `signer_address` */
export async function signSafeOpSnapshot(
  privateKey: Hex,
  snapshot: UserOpSnapshot
): Promise<{ signer: Address; signature: Hex }> {
  const { signer_address, signature } = await coreSign(privateKey, snapshot);
  return { signer: signer_address, signature };
}

export async function executeMultisigUserOp(
  snapshot: UserOpSnapshot,
  signatures: CollectedSignature[],
  threshold: number,
  chain: Chain
): Promise<{ userOpHash: Hex; txHash: Hex; actualGasCost: string }> {
  const result = await coreExecute(chainContext(chain.id), snapshot, signatures, threshold);
  return { ...result, actualGasCost: result.actualGasCost.toString() };
}

export { packMultisigSignatures };

/** 未部署时的提示是给用户看的，中文文案留在 app 层 */
export async function getSafeOwners(
  safeAddress: Address,
  chain: Chain
): Promise<{ owners: Address[]; getPrevOwner: (owner: Address) => Address }> {
  try {
    const { owners, getPrevOwner } = await coreGetSafeOwners(chainContext(chain.id), safeAddress);
    return { owners, getPrevOwner };
  } catch (error) {
    if (error instanceof SafeNotDeployedError) {
      throw new Error(
        "该多签数字身份合约尚未部署到链上（当前地址无合约代码）。请先发起一笔交易并完成执行后，再进行“链上同步/移除签名者”等链上读取操作。"
      );
    }
    throw error;
  }
}

export async function getSafeOwnersAndThreshold(
  safeAddress: Address,
  chain: Chain
): Promise<{ owners: Address[]; threshold: number }> {
  const { owners, threshold } = await coreGetSafeOwners(chainContext(chain.id), safeAddress);
  return { owners, threshold };
}

/** 返回以 ETH 计的字符串，保留 6 位小数（UI 用） */
export async function getActualGasFee(txHash: Hex, chain: Chain): Promise<string | null> {
  const wei = await coreGetActualGasFee(chainContext(chain.id), txHash);
  return wei === null ? null : Number(formatEther(wei)).toFixed(6);
}

export async function estimateMultisigTransferGas(params: {
  safeAddress: Address;
  owners: Address[];
  threshold: number;
  chain: Chain;
  to: Address;
  value?: bigint;
  data?: Hex;
}): Promise<{ estimatedEth: string; breakdown: Record<string, string> }> {
  const { safeAddress, owners, threshold, chain, to, value = 0n, data = "0x" } = params;
  const ctx = chainContext(chain.id);
  const calls = [{ to, value, data }];

  const account = await getVirtualSafeAccount(safeAddress, chain, { threshold, owners });
  const { bundlerClient } = await prepareClient(chain, false);
  const gas = await estimateMultisigGas(ctx, bundlerClient as never, {
    account,
    calls,
    threshold,
  });

  const totalGas = gas.verificationGasLimit + gas.callGasLimit + gas.preVerificationGas;
  return {
    estimatedEth: Number(formatEther(totalGas * gas.maxFeePerGas)).toFixed(6),
    breakdown: {
      verificationGasLimit: gas.verificationGasLimit.toString(),
      callGasLimit: gas.callGasLimit.toString(),
      preVerificationGas: gas.preVerificationGas.toString(),
      maxFeePerGas: gas.maxFeePerGas.toString(),
    },
  };
}

// ─── Safe owner 管理的 calldata 编码（名字保持不变，页面在用）──────────────

export const encodeAddOwnerCall = encodeAddOwner;
export const encodeRemoveOwnerCall = encodeRemoveOwner;
export const encodeChangeThresholdCall = encodeChangeThreshold;
export const encodeSwapOwnerCall = encodeSwapOwner;

/** 缩写地址：0x1234...abcd。纯展示，不进 semi-core。 */
export function abbreviateAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
