/**
 * 执行一笔已收齐签名的多签交易。详情页和队列页共用这一份——以前两边各写
 * 一套，队列页漏了余额检查，主网上余额不够的交易被发了出去。
 *
 * 状态约定（后端 status）：
 * - 锁定前的检查失败（余额不够等）：什么都不改，仍是 ready。
 * - bundler 当场拒收（没上链）且换个时机可能成功（出价低于 bundler 最低价、
 *   预付不足）：解锁回 ready，抛 ExecutionNotSubmittedError 说明原因。
 * - 同一份快照永远不可能成功（签名/nonce 不对、快照过期、上链后调用回滚）：
 *   标记 failed，需要重新发起。
 * - 已提交但没等到回执：保持 executing，不能当失败（可能还会上链）。
 * - 拿到 txHash 之后：链上已提交，任何后续失败都不能再标记 failed。
 */
import { parseEther, type Address } from "viem";
import { UserOpPendingError, UserOpRejectedError } from "semi-core";
import { chainMap } from "~/stores/chain";
import { getBalance } from "~/utils/balance";
import { chainName, isSafeActivated } from "~/utils/multisig_chains";
import {
  confirmMultisigTx,
  executeMultisigTx,
  failMultisigTx,
  getMultisigWalletOwners,
  resetExecutingMultisigTx,
  syncMultisigWallet,
  type MultisigTx,
  type MultisigWallet,
} from "~/utils/multisig_api";
import { executeMultisigUserOp, getSafeOwnersAndThreshold } from "~/utils/SafeSmartAccount/multisig";
import { uploadTransaction } from "~/utils/semi_api";

export const CONFIG_TX_TYPES = ["add_owner", "remove_owner", "change_threshold", "replace_owner"];

export type ExecuteOutcome = { txHash: string } | { confirmPending: true; txHash: string };

/** 交易没有上链，已退回「待执行」，可以稍后直接重试 */
export class ExecutionNotSubmittedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExecutionNotSubmittedError";
  }
}

const formatEth = (wei: bigint) => {
  const s = (Number(wei) / 1e18).toPrecision(3);
  return `${Number(s)} ETH`;
};

/** 锁定前检查：自付 gas 的链上余额够不够预付，转出的 ETH 够不够 */
async function assertBalance(t: MultisigTx, wallet: MultisigWallet) {
  const snap = t.user_op_snapshot;
  const chain = chainMap[t.chain_id];
  if (!snap || !chain) return;

  let need = 0n;
  if (snap.sponsored === false) {
    // EntryPoint 按 gas 上限 × maxFeePerGas 预付（没有 paymaster 时）
    need +=
      (BigInt(snap.verificationGasLimit) + BigInt(snap.callGasLimit) + BigInt(snap.preVerificationGas)) *
      BigInt(snap.maxFeePerGas);
  }
  if (t.tx_type === "transfer" && t.call_detail?.amount) {
    need += parseEther(String(t.call_detail.amount));
  }
  if (need === 0n) return;

  const balance = await getBalance(wallet.safe_address as Address, chain);
  if (balance < need) {
    const what = snap.sponsored === false ? "转账金额和手续费" : "转账金额";
    throw new Error(
      `${chainName(t.chain_id)} 上数字身份的 ETH 余额（${formatEth(balance)}）不足以支付${what}` +
        `（约 ${formatEth(need)}）${snap.sponsored === false ? "，该链不代付 gas" : ""}。请先充值再执行。`
    );
  }
}

function notSubmittedMessage(t: MultisigTx, err: UserOpRejectedError): string {
  const chain = chainName(t.chain_id);
  if (err.minMaxFeePerGas !== undefined) {
    return `${chain} 当前的 gas 价格高于这笔提案锁定的价格，bundler 暂不接收。交易没有上链，仍为待执行；等 gas 回落后重试，或撤回后重新发起。`;
  }
  if (err.aaCode === "AA21") {
    return `${chain} 上数字身份的 ETH 余额不足以预付手续费。交易没有上链，仍为待执行；充值后重试。`;
  }
  return `bundler 拒绝了这笔交易：${err.message}。交易没有上链，仍为待执行。`;
}

/** 配置变更执行后，以链上真实状态刷新后端的 owner 镜像 */
async function syncWalletRowFromChain(t: MultisigTx, wallet: MultisigWallet) {
  try {
    const chain = chainMap[t.chain_id];
    if (!chain) return;
    const { owners, threshold } = await getSafeOwnersAndThreshold(wallet.safe_address as Address, chain);
    await syncMultisigWallet({ wallet_id: t.wallet_id, owners, threshold });
  } catch {
    // 链上读取失败不阻断；后端已按 call_detail 更新镜像，可手动「从链上同步」兜底
  }
}

export async function executeMultisigTransaction(t: MultisigTx, wallet: MultisigWallet): Promise<ExecuteOutcome> {
  await assertBalance(t, wallet);

  const { tx: lockedTx } = await executeMultisigTx(t.id);
  let submittedTxHash: string | undefined;

  try {
    if (!lockedTx.user_op_snapshot || !lockedTx.signatures) throw new Error("Missing snapshot/signatures");
    const chain = chainMap[lockedTx.user_op_snapshot.chainId];
    if (!chain) throw new Error("Unsupported chain");

    // 以当前 owner 集合 + 当前门限打包签名（与链上 checkSignatures 一致）
    const { owners: rowOwners } = await getMultisigWalletOwners(wallet.id);
    const currentOwnerSet = new Set(
      (lockedTx.current_owners || rowOwners.map((o) => o.owner_address)).map((a) => a.toLowerCase())
    );
    const eligibleSignatures = lockedTx.signatures.filter((s) => currentOwnerSet.has(s.signer_address.toLowerCase()));
    const execThreshold = lockedTx.current_threshold ?? lockedTx.threshold_at_creation;
    if (eligibleSignatures.length < execThreshold) {
      throw new Error("当前有效签名数不足（成员或门限已变更），请重新收集签名");
    }

    const { txHash, userOpHash, actualGasCost } = await executeMultisigUserOp(
      lockedTx.user_op_snapshot,
      eligibleSignatures,
      execThreshold,
      chain
    );
    submittedTxHash = txHash; // 链上已提交，越过此处不可再标记为 failed
    // 第一笔交易会顺带部署 Safe：刷新「已激活」状态的缓存
    isSafeActivated(wallet.safe_address, t.chain_id, true).catch(() => {});

    // confirm 失败属于可恢复状态：交易已上链，绝不能因此把它标记为 failed
    try {
      await confirmMultisigTx({ multisig_tx_id: t.id, tx_hash: txHash, gas_used: actualGasCost, user_op_hash: userOpHash });
    } catch (confirmErr) {
      console.error("[multisig execute] confirm failed after on-chain success:", confirmErr);
      return { confirmPending: true, txHash };
    }

    // 与单签一致：上传到常规交易表，使收款方能查到备注
    try {
      await uploadTransaction({
        tx_hash: txHash,
        gas_used: "0",
        status: "success",
        chain: chain.name.toLowerCase(),
        data: "",
        memo: t.memo || "",
        sender_note: t.sender_note || "",
        sender_address: wallet.safe_address,
        receiver_address: t.call_detail?.to || "",
      });
    } catch (e) {
      console.error("[multisig execute] upload transaction failed:", e);
    }

    if (CONFIG_TX_TYPES.includes(t.tx_type)) await syncWalletRowFromChain(t, wallet);
    return { txHash };
  } catch (err) {
    if (submittedTxHash) throw err;

    if (err instanceof UserOpPendingError) {
      // 已提交、没等到回执：保持 executing。5 分钟后可「重置」，届时若已上链，bundler 会以 nonce 拒绝
      throw new Error(`交易已提交但暂未确认（${err.userOpHash}），请稍后刷新查看，不要重新发起。`);
    }
    if (err instanceof UserOpRejectedError && !err.permanent) {
      await resetExecutingMultisigTx(t.id).catch(() => failMultisigTx(t.id).catch(() => {}));
      throw new ExecutionNotSubmittedError(notSubmittedMessage(t, err));
    }
    await failMultisigTx(t.id).catch(() => {});
    throw err;
  }
}
