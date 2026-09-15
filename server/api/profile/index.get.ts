import { badgeGet, BadgeBackendError, type BadgeProfileRow } from "@/server/utils/badge_backend";
import { SERVER_CHAINS } from "@/server/utils/chains";

const chains = SERVER_CHAINS;

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
