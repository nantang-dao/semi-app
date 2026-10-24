import type { Address } from "viem";
import { isSponsorshipFailure, probePaymasterAvailable } from "semi-core/multisig";
import { chainContext, semiCore } from "~/utils/semi_core";

/** 这条链是否配了 paymaster（配了才能代付 gas） */
export const isGasSponsorshipChain = (chainId: number) =>
  semiCore().has(chainId) && semiCore().chain(chainId).canSponsorGas;

/**
 * 确认页之前用：有 credit 也不够，还得 paymaster 现在真能代付。
 * 探活失败 → false（走自付展示），不抛错。
 */
export async function canSponsorTransferNow(
  chainId: number,
  sender: Address
): Promise<boolean> {
  if (!isGasSponsorshipChain(chainId)) return false;
  return probePaymasterAvailable(chainContext(chainId), sender);
}

export { isSponsorshipFailure };
