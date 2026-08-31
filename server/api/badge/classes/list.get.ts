import { getProfileId } from "@/server/utils";
import { normalizeAddress } from "@/server/utils/badge_address";
import { badgeGet, BadgeBackendError, type BadgeClassRow } from "@/server/utils/badge_backend";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const { chain_id, wallet_address } = query;
  if (!wallet_address || !chain_id) {
    return {
      success: false,
      message: "Invalid request",
      data: [],
    };
  }

  try {
    // 按 profile_id 查，跟 summary 一致。按地址查会多带出 profile_id 指向不存在
    // profile 的脏行。地址要先规范成 checksummed，它是 namehash 的输入。
    const profile_id = getProfileId(normalizeAddress(wallet_address as string), Number(chain_id));
    const result = await badgeGet<{ badge_classes: BadgeClassRow[] }>("/classes", {
      chain_id: Number(chain_id),
      profile_id,
    });
    return {
      success: true,
      message: "Classes fetched successfully",
      data: { badge_classes: result.badge_classes },
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: error instanceof BadgeBackendError ? error.message : "Failed to fetch classes",
      data: [],
    };
  }
});
