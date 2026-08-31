import { sepolia, mainnet, optimism } from "viem/chains";
import { badgeGet, BadgeBackendError, type BadgeProfileRow } from "@/server/utils/badge_backend";

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

  try {
    const result = await badgeGet<{ profile: BadgeProfileRow | null }>("/profile", {
      wallet_address,
      chain_id: chain.id,
    });
    return {
      success: true,
      message: result.profile ? "Profile found" : "Profile not found",
      data: { profile: result.profile },
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: error instanceof BadgeBackendError ? error.message : "Failed to fetch profile",
      data: { profile: null },
    };
  }
});
