import { verifyBadgeAuth, BadgeAuthError } from "@/server/utils/badge_auth";
import { predictSafeAccountAddress } from "@/utils/SafeSmartAccount";
import { sepolia, mainnet, optimism } from "viem/chains";
import { getBadgeId } from "@/server/utils";
import { normalizeAddress } from "@/server/utils/badge_address";
import { sola_badge_contract_address } from "@/server/utils/solar_badge/contracts";
import { badgeGet, badgePost, type BadgeClassRow } from "@/server/utils/badge_backend";

const chains = {
  "11155111": sepolia,
  "1": mainnet,
  "10": optimism,
} as const;

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  const { class_id, receiver_addresses, chain_id, badge_name, badge_description, badge_image_url } =
    body;

  if (
    !class_id ||
    !receiver_addresses ||
    !Array.isArray(receiver_addresses) ||
    receiver_addresses.length === 0 ||
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

  let eoa_address: `0x${string}`;
  try {
    eoa_address = await verifyBadgeAuth({
      body,
      action: "create-badges",
      chainId: chain.id,
      params: { class_id, receiver_addresses, badge_name, badge_description, badge_image_url },
    });
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: error instanceof BadgeAuthError ? error.message : "Unauthorized",
    };
  }

  await predictSafeAccountAddress({ owner: eoa_address as `0x${string}`, chain: chain });

  let badge_class: BadgeClassRow;
  try {
    const result = await badgeGet<{ badge_class: BadgeClassRow }>("/classes/details", {
      class_id,
      chain_id: chain.id,
    });
    badge_class = result.badge_class;
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "Badge class not found",
    };
  }

  const contract_addresses = sola_badge_contract_address[chain.id];
  if (!contract_addresses || badge_class.chain_id !== chain.id) {
    return {
      success: false,
      message: "Invalid badge class",
    };
  }

  // 收件人地址参与 badge_id 的 namehash，一旦以非规范形式落库，这枚徽章就再也
  // 领不了了（历史上正是这样卡住了 4 枚）。写库前统一成 checksummed。
  let receivers: string[];
  try {
    receivers = (receiver_addresses as string[]).map(normalizeAddress);
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "Invalid receiver address",
    };
  }

  try {
    const badges = receivers.map((receiver) => ({
      // 第一段只是随机标签，认的是 namehash 之后的值。
      badge_id: getBadgeId(crypto.randomUUID(), class_id, receiver as `0x${string}`, chain.id),
      class_id,
      wallet_address: receiver,
      metadata: {
        badge_name,
        badge_description,
        badge_image_url,
      },
    }));

    // 整批一个请求：后端放在一个事务里，不会出现半批成功而发送方不知道发出去几枚。
    await badgePost("/items", { chain_id: chain.id, badges });

    return {
      success: true,
      message: "Badges created successfully",
      data: {
        badge_ids: badges.map((b) => b.badge_id),
      },
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "Failed to create badges",
    };
  }
});
