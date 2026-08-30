import db from "@/server/utils/db";
import { verifyBadgeAuth, BadgeAuthError } from "@/server/utils/badge_auth";
import { predictSafeAccountAddress } from "@/utils/SafeSmartAccount";
import { sepolia, mainnet, optimism } from "viem/chains";
import { id } from "@instantdb/admin";
import { getProfileId, getBadgeClassId } from "@/server/utils";
import { badgeWalletClient } from "@/server/utils/badge_wallet";
import { profileRegistryAbi } from "@/server/utils/solar_badge";
import { sola_badge_contract_address } from "@/server/utils/solar_badge/contracts";

const chains = {
  "11155111": sepolia,
  "1": mainnet,
  "10": optimism,
} as const;

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  const { chain_id, class_name, class_description, class_image_url } = body;

  if (!chain_id || !class_name || !class_description || !class_image_url) {
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
      action: "create-class",
      chainId: chain.id,
      params: { class_name, class_description, class_image_url },
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

  const profile_id = getProfileId(safe_account_address, chain.id);

  const queryProfile = await db.query({
    profiles: {
      $: { where: { profile_id: profile_id.toString(), chain_id: chain.id } },
    },
  });

  const contract_addresses = sola_badge_contract_address[chain.id];
  if (!contract_addresses) {
    return {
      success: false,
      message: "Invalid chain id",
    };
  }

  if (queryProfile.profiles.length === 0) {
    // create new profile
    return {
      success: false,
      message: "Profile not found",
    };
  }

  // register class
  try {
    const new_class_id = id();
    const class_id = getBadgeClassId(new_class_id, safe_account_address, chain.id);
    const create_class_hash = await badgeWalletClient(chain.id).writeContract({
      address: contract_addresses.profile_registry,
      abi: profileRegistryAbi,
      functionName: "registerClass",
      args: [BigInt(profile_id), BigInt(class_id), contract_addresses.badgeUnbounded],
    });
    console.log("create class tx hash", create_class_hash);

    await db.transact([
      db.tx.badge_classes[new_class_id].create({
        class_id,
        chain_id: chain.id,
        profile_id,
        wallet_address: safe_account_address,
        badge_contract_address: contract_addresses.badgeUnbounded,
        metadata: {
          class_name,
          class_description,
          class_image_url,
        },
        tx_hash: create_class_hash,
      }),
    ]);

    return {
      success: true,
      message: "Class created successfully",
      data: {
        class_id,
        profile_id,
        tx_hash: create_class_hash,
      },
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "Failed to register class",
    };
  }
});
