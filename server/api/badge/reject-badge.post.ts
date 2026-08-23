import db from "@/server/utils/db";
import { keystoreToPrivateKey, privateKeyToAddress } from "semi-core/keys";
import { predictSafeAccountAddress } from "@/utils/SafeSmartAccount";
import { sepolia, mainnet, optimism } from "viem/chains";

const chains = {
  "11155111": sepolia,
  "1": mainnet,
  "10": optimism,
} as const;

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  const { badge_id, pin_code, keystore_json, chain_id } = body;

  if (!pin_code || !keystore_json || !badge_id || !chain_id) {
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

  let eoa_address = "0x0000000000000000000000000000000000000000";
  try {
    const private_key = await keystoreToPrivateKey(JSON.parse(keystore_json), pin_code);
    eoa_address = privateKeyToAddress(private_key as `0x${string}`);
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "Invalid passcode",
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

  if (badge.wallet_address !== safe_account_address) {
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
