import type { Address } from "viem";
import { isSponsorshipFailure, probePaymasterAvailable } from "semi-core/multisig";
import { chainContext, semiCore } from "~/utils/semi_core";

/** 这条链是否配了 paymaster（配了才能代付 gas） */
export const isGasSponsorshipChain = (chainId: number) =>
  semiCore().has(chainId) && semiCore().chain(chainId).canSponsorGas;

/**
 * 确认页之前用：有 credit 也不够，还得 paymaster 现在真能代付。
 *
 * 返回 `null` = 探活问不出结果（RPC 失败 / 限流 / 占位 calldata 被策略拒），
 * **不是**「不能代付」。调用方对 null 应当照常先试代付，不要直接按自付展示。
 */
export async function canSponsorTransferNow(
  chainId: number,
  sender: Address
): Promise<boolean | null> {
  if (!isGasSponsorshipChain(chainId)) return false;
  return probePaymasterAvailable(chainContext(chainId), sender);
}

/**
 * 多签建快照之前用：这笔要不要申请代付。
 *
 * 这里没有第二次机会。快照一旦签进 SafeOp 哈希，gas 和 paymaster 字段就改不了：
 * 代付发不出去**也不能改成自付重发**，只能作废、重新收一轮签名。所以只有在
 * 确认不能代付（`false`：这条链没配 paymaster，或 EntryPoint 里的存款低于底线）
 * 时才建自付快照。
 *
 * `null`（问不出来）仍然按代付建：存款为零时探活给的是确定的 `false` 而不是 null
 * （见 probePaymasterAvailable），而一次 RPC 抖动就改走自付，会让一个本来不用
 * 持有 ETH 的钱包卡在「余额不足以支付手续费」上，还得重新发起。
 */
export async function shouldSponsorMultisigFee(
  chainId: number,
  safeAddress: Address
): Promise<boolean> {
  return (await canSponsorTransferNow(chainId, safeAddress)) !== false;
}

export { isSponsorshipFailure };
