import db from "@/server/utils/db";
import { sepolia, mainnet, optimism } from "viem/chains";
import { sola_badge_contract_address } from "@/server/utils/solar_badge/contracts";
import { addressVariants } from "@/server/utils/badge_address";

const chains = {
  "11155111": sepolia,
  "1": mainnet,
  "10": optimism,
} as const;

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const { chain_id, wallet_address } = query;

  if (!wallet_address || !chain_id) {
    return {
      success: false,
      message: "Invalid parameters",
    };
  }

  if (!chains[chain_id as keyof typeof chains]) {
    return {
      success: false,
      message: "Invalid chain id",
    };
  }
  const chain = chains[chain_id as keyof typeof chains];

  const contract_addresses = sola_badge_contract_address[chain.id];
  if (!contract_addresses) {
    return {
      success: false,
      message: "Invalid chain id",
    };
  }

  try {
    const queryBadges = await db.query({
      badges: {
        $: {
          where: {
            wallet_address: { $in: addressVariants(wallet_address as string) },
            chain_id: Number(chain_id),
            status: "pending",
          },
        },
      },
    });
    return {
      success: true,
      message: "Badges fetched successfully",
      data: queryBadges,
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "Failed to fetch badges",
      data: [],
    };
  }
});
