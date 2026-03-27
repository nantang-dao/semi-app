import { createPublicClient, http, type Chain } from "viem";
import { createBundlerClient, createPaymasterClient } from "viem/account-abstraction";
import { BUNDLER_URL, RPC_URL, PAYMASTER_URL } from "../../config";

export const prepareClient = async (chain: Chain, sponsorFee: boolean) => {
  const bundlerUrl = BUNDLER_URL[chain.id];
  if (!bundlerUrl) {
    console.log("Unsupported chain: ", chain);
    throw new Error(`Unsupported chain: ${chain.name}`);
  }

  console.log("[Sponsor Fee]:", sponsorFee);
  const publicClient = createPublicClient({
    chain,
    transport: http(RPC_URL[chain.id]),
  });

  let paymasterClient = undefined;

  if (sponsorFee && (!PAYMASTER_URL[chain.id] || PAYMASTER_URL[chain.id] === "")) {
    // Fail fast — otherwise UI may think it's sponsored but the userOp is not.
    throw new Error(
      `Gas sponsorship requested but PAYMASTER_URL is not configured for chain ${chain.id} (${chain.name})`
    );
  }

  if (PAYMASTER_URL[chain.id] && sponsorFee) {
    paymasterClient = createPaymasterClient({
      transport: http(PAYMASTER_URL[chain.id]),
    });
  }

  const bundlerClient = createBundlerClient({
    chain,
    transport: http(bundlerUrl),
    paymaster: paymasterClient,
  });

  return {
    publicClient,
    bundlerClient,
    paymasterClient,
  };
};
