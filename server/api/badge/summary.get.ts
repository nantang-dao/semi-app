import { getProfileId } from "@/server/utils";
import { normalizeAddress } from "@/server/utils/badge_address";
import {
  badgeGet,
  BadgeBackendError,
  type BadgeRow,
  type BadgeClassRow,
} from "@/server/utils/badge_backend";
import { SUPPORTED_CHAIN_IDS } from "@/server/utils/chains";


export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const { chain_id, wallet_address } = query;

  if (!wallet_address || !chain_id) {
    return { success: false, message: "Invalid parameters", data: null };
  }

  const chainId = Number(chain_id);
  if (!SUPPORTED_CHAIN_IDS.has(chainId)) {
    return { success: false, message: "Invalid chain id", data: null };
  }

  try {
    // profile_id 是 namehash 出来的，输入地址必须是 checksummed，
    // 否则算出来的 id 跟库里那条对不上。
    const profile_id = getProfileId(normalizeAddress(wallet_address as string), chainId);
    const result = await badgeGet<{
      owned: BadgeRow[];
      pending: BadgeRow[];
      badge_classes: BadgeClassRow[];
    }>("/summary", { wallet_address, chain_id: chainId, profile_id });

    return {
      success: true,
      message: "Badges fetched successfully",
      data: {
        owned: result.owned,
        pending: result.pending,
        badge_classes: result.badge_classes,
      },
    };
  } catch (error) {
    console.error("Failed to fetch badge summary:", error);
    return {
      success: false,
      message: error instanceof BadgeBackendError ? error.message : "Failed to fetch badges",
      data: null,
    };
  }
});
