import { type Chain } from "viem/chains";
import type { Address } from "viem";
import {
  getSafeAccount as coreGetSafeAccount,
  getVirtualSafeAccount as coreGetVirtualSafeAccount,
  predictAddress,
} from "semi-core/account";
import { chainContext } from "~/utils/semi_core";

/**
 * semi-core 的账户函数在 app 里的适配层：把 viem 的 `chain` 换算成
 * semi-core 的 ChainContext，其余原样透传。
 */

export const getSafeAccount = async (
  privateKey: `0x${string}`,
  chain: Chain,
  options?: { owners?: Address[]; threshold?: number }
) =>
  coreGetSafeAccount(chainContext(chain.id), {
    privateKey,
    owners: options?.owners,
    threshold: options?.threshold,
  });

/** 估算 gas 用的只读账户（multisig 须传真实 owners 以匹配 initCode） */
export const getVirtualSafeAccount = async (
  safeAccountAddress: Address,
  chain: Chain,
  options?: { threshold?: number; owners?: Address[]; ownerCount?: number }
) =>
  coreGetVirtualSafeAccount(chainContext(chain.id), {
    address: safeAccountAddress,
    owners: options?.owners,
    threshold: options?.threshold,
    ownerCount: options?.ownerCount,
  });

export const predictSafeAccountAddress = async ({
  owner,
  chain,
  owners,
  threshold,
}: {
  owner?: Address;
  chain: Chain;
  owners?: Address[];
  threshold?: number;
}): Promise<Address> => predictAddress(chainContext(chain.id), { owner, owners, threshold });
