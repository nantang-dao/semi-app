import { verifyBadgeAuth, BadgeAuthError } from "@/server/utils/badge_auth";
import { predictSafeAccountAddress } from "@/utils/SafeSmartAccount";
import { getProfileId, getBadgeClassId } from "@/server/utils";
import { badgeWalletClient } from "@/server/utils/badge_wallet";
import { profileRegistryAbi } from "@/server/utils/solar_badge";
import { sola_badge_contract_address } from "@/server/utils/solar_badge/contracts";
import { badgeGet, badgePost, type BadgeProfileRow } from "@/server/utils/badge_backend";
import { SERVER_CHAINS } from "@/server/utils/chains";

const chains = SERVER_CHAINS;

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

  const contract_addresses = sola_badge_contract_address[chain.id];
  if (!contract_addresses) {
    return {
      success: false,
      message: "Invalid chain id",
    };
  }

  let profile: BadgeProfileRow | null;
  try {
    const result = await badgeGet<{ profile: BadgeProfileRow | null }>("/profile", {
      wallet_address: safe_account_address,
      chain_id: chain.id,
    });
    profile = result.profile;
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "Failed to look up profile",
    };
  }

  if (!profile) {
    return {
      success: false,
      message: "Profile not found",
    };
  }

  // register class
  try {
    // class_id 的第一段只是一个随机标签，链上和库里认的都是 namehash 之后的值。
    const class_id = getBadgeClassId(crypto.randomUUID(), safe_account_address, chain.id);
    const create_class_hash = await badgeWalletClient(chain.id).writeContract({
      address: contract_addresses.profile_registry,
      abi: profileRegistryAbi,
      functionName: "registerClass",
      args: [BigInt(profile_id), BigInt(class_id), contract_addresses.badgeUnbounded],
    });
    console.log("create class tx hash", create_class_hash);

    await badgePost("/classes", {
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
    });

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
