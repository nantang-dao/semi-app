import { type Chain } from "viem";
import { http } from "viem";
import { createBundlerClient, createPaymasterClient } from "viem/account-abstraction";
import { PaymasterNotConfiguredError } from "semi-core";
import { chainContext } from "~/utils/semi_core";

export const prepareClient = async (chain: Chain, sponsorFee: boolean) => {
  const ctx = chainContext(chain.id);

  if (!ctx.bundlerUrl) {
    throw new Error(`No bundler configured for chain ${chain.id} (${chain.name})`);
  }

  // 快速失败：否则 UI 以为走了代付，实际发出去的 userOp 却是自付的
  if (sponsorFee && !ctx.canSponsorGas) {
    throw new PaymasterNotConfiguredError(chain.id);
  }

  const paymasterClient =
    sponsorFee && ctx.paymasterUrl
      ? createPaymasterClient({ transport: http(ctx.paymasterUrl) })
      : undefined;

  const bundlerClient = createBundlerClient({
    chain,
    transport: http(ctx.bundlerUrl),
    paymaster: paymasterClient,
  });

  return { publicClient: ctx.publicClient, bundlerClient, paymasterClient };
};
