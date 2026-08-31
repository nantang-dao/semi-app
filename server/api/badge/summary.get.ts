import { getProfileId } from "@/server/utils";
import db from "@/server/utils/db";
import type { Badge, BadgeClass } from "./types";
import { addressVariants, normalizeAddress } from "@/server/utils/badge_address";

const SUPPORTED_CHAIN_IDS = new Set([1, 10, 11155111]);

/**
 * Everything the badges page needs, in a single InstantDB round trip.
 *
 * Replaces three separate calls (classes/list + owned + pending), which cost
 * three HTTP requests and three queries for data that is always rendered
 * together. Owned and pending live in the same entity, so `$in` fetches both
 * and we split them here.
 */
export default defineEventHandler(async (event) => {
  const { chain_id, wallet_address } = getQuery(event);

  if (!wallet_address || !chain_id) {
    return { success: false, message: "Invalid parameters", data: null };
  }

  const chainId = Number(chain_id);
  if (!SUPPORTED_CHAIN_IDS.has(chainId)) {
    return { success: false, message: "Invalid chain id", data: null };
  }

  try {
    const result = await db.query({
      badges: {
        $: {
          where: {
            wallet_address: { $in: addressVariants(wallet_address as string) },
            chain_id: chainId,
            status: { $in: ["accepted", "pending"] },
          },
        },
      },
      badge_classes: {
        $: {
          where: {
            // profile_id 是 namehash 出来的，输入地址必须是 checksummed，
            // 否则算出来的 id 跟库里那条对不上。
            profile_id: getProfileId(normalizeAddress(wallet_address as string), chainId),
            chain_id: chainId,
          },
        },
      },
    });

    const badges = (result.badges ?? []) as Badge[];

    return {
      success: true,
      message: "Badges fetched successfully",
      data: {
        owned: badges.filter((b) => b.status === "accepted"),
        pending: badges.filter((b) => b.status === "pending"),
        badge_classes: (result.badge_classes ?? []) as BadgeClass[],
      },
    };
  } catch (error) {
    console.error("Failed to fetch badge summary:", error);
    return {
      success: false,
      message: "Failed to fetch badges",
      data: null,
    };
  }
});
