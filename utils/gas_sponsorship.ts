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

export { isSponsorshipFailure };
