import db from "@/server/utils/db";
import { verifyBadgeAuth, BadgeAuthError } from "@/server/utils/badge_auth";
import { predictSafeAccountAddress } from "@/utils/SafeSmartAccount";
import { sameAddress } from "@/server/utils/badge_address";
import { sepolia, mainnet, optimism } from "viem/chains";

const chains = {
  "11155111": sepolia,
  "1": mainnet,
  "10": optimism,
} as const;

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  const { badge_id, chain_id } = body;

  if (!badge_id || !chain_id) {
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

  let eoa_address: `0x${string}`;
  try {
    eoa_address = await verifyBadgeAuth({
      body,
      action: "reject-badge",
      chainId: chain.id,
      params: { badge_id },
    });
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: error instanceof BadgeAuthError ? error.message : "Unauthorized",
    };
  }

  const safe_account_address = await predictSafeAccountAddress({
    owner: eoa_address as `0x${string}`,
    chain: chain,
  });

  const queryBadge = await db.query({
    badges: {
      $: { where: { badge_id, chain_id } },
    },
  });

  if (queryBadge.badges.length === 0) {
    return {
      success: false,
      message: "Badge not found",
    };
  }

  const badge = queryBadge.badges[0];

  if (badge.status !== "pending") {
    return {
      success: false,
      message: "Badge is not pending",
    };
  }

  // 不能直接用 !== ：库里有历史遗留的全小写收件人地址，而这里算出来的
  // 必然是 checksummed，严格比较会把徽章的真正持有人挡在外面。
  if (!sameAddress(badge.wallet_address, safe_account_address)) {
    return {
      success: false,
      message: "Badge is not owned by the user",
    };
  }

  if (badge.chain_id.toString() !== chain.id.toString()) {
    return {
      success: false,
      message: "Badge is not on the same chain",
    };
  }

  const badgeclassQuery = await db.query({
    badge_classes: {
      $: { where: { class_id: badge.class_id, chain_id: badge.chain_id } },
    },
  });

  if (badgeclassQuery.badge_classes.length === 0) {
    return {
      success: false,
      message: "Badge class not found",
    };
  }

  try {
    await db.transact([db.tx.badges[badge.id].update({ status: "rejected" })]);

    return {
      success: true,
      message: "Badge rejected successfully",
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Fail to reject badge",
    };
  }
});
