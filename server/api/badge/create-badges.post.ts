import db from "@/server/utils/db";
import { keystoreToPrivateKey, privateKeyToAddress } from "semi-core/keys";
import { predictSafeAccountAddress } from "@/utils/SafeSmartAccount";
import { sepolia, mainnet, optimism } from "viem/chains";
import { id } from "@instantdb/admin";
import { getProfileId, getBadgeId } from "@/server/utils";
import { sola_badge_contract_address } from "@/server/utils/solar_badge/contracts";

const chains = {
  "11155111": sepolia,
  "1": mainnet,
  "10": optimism,
} as const;

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  const {
    class_id,
    receiver_addresses,
    pin_code,
    keystore_json,
    chain_id,
    badge_name,
    badge_description,
    badge_image_url,
  } = body;

  if (
    !class_id ||
    !receiver_addresses ||
    receiver_addresses.length === 0 ||
    !pin_code ||
    !keystore_json ||
    !chain_id ||
    !badge_name ||
    !badge_description ||
    !badge_image_url
  ) {
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

  const profile_id = getProfileId(safe_account_address, chain.id);

  const queryBadgeClass = await db.query({
    badge_classes: {
      $: { where: { class_id } },
    },
  });

  if (queryBadgeClass.badge_classes.length === 0) {
    return {
      success: false,
      message: "Badge class not found",
    };
  }

  const badge_class = queryBadgeClass.badge_classes[0];

  const contract_addresses = sola_badge_contract_address[chain.id];
  if (!contract_addresses || badge_class.chain_id !== chain.id) {
    return {
      success: false,
      message: "Invalid badge class",
    };
  }

  // create badges
  try {
    const datebase_ids = Array.from({ length: receiver_addresses.length }, () => id());
    const badge_ids = datebase_ids.map((badge_id, index) => {
      console.log("badge_id =>", badge_id, receiver_addresses[index], chain.id);
      return getBadgeId(badge_id, class_id, receiver_addresses[index] as `0x${string}`, chain.id);
    });

    console.log("datebase_ids", datebase_ids);
    console.log("badge_ids", badge_ids);

    await db.transact(
      datebase_ids.map((id, index) => {
        const new_badge = {
          badge_id: badge_ids[index],
          class_id: class_id,
          wallet_address: receiver_addresses[index],
          chain_id: chain.id,
          metadata: {
            badge_name,
            badge_description,
            badge_image_url,
          },
          created_at: new Date(),
          status: "pending",
        };

        return db.tx.badges[id].create(new_badge);
      })
    );
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "Failed to register class",
    };
  }

  return {
    success: true,
    message: "Class created successfully",
    data: {
      class_id,
      profile_id,
    },
  };
});
