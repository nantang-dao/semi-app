import { sepolia, mainnet, optimism } from "viem/chains";
import { sola_badge_contract_address } from "@/server/utils/solar_badge/contracts";
import { badgeGet, BadgeBackendError, type BadgeRow } from "@/server/utils/badge_backend";

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
    const result = await badgeGet<{ badges: BadgeRow[] }>("/owned", {
      wallet_address,
      chain_id: chain.id,
    });
    return {
      success: true,
      message: "Badges fetched successfully",
      // 保持 InstantDB 时代的形状：调用方读的是 data.badges
      data: { badges: result.badges },
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: error instanceof BadgeBackendError ? error.message : "Failed to fetch badges",
      data: [],
    };
  }
});
