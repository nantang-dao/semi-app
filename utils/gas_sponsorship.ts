import { semiCore } from "~/utils/semi_core";

/** 这条链是否配了 paymaster（配了才能代付 gas） */
export const isGasSponsorshipChain = (chainId: number) =>
  semiCore().has(chainId) && semiCore().chain(chainId).canSponsorGas;
