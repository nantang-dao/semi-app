import { verifyBadgeAuth, BadgeAuthError } from "@/server/utils/badge_auth";
import { predictSafeAccountAddress } from "@/utils/SafeSmartAccount";
import { sameAddress } from "@/server/utils/badge_address";
import { sepolia, mainnet, optimism } from "viem/chains";
import { badgeWalletClient, badgeReadClient } from "@/server/utils/badge_wallet";
import { badgeUnboundedAbi } from "@/server/utils/solar_badge";
import {
  badgeGet,
  badgePost,
  BadgeBackendError,
  type BadgeRow,
  type BadgeClassRow,
} from "@/server/utils/badge_backend";

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
      action: "accept-badge",
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

  let badge: BadgeRow;
  try {
    const result = await badgeGet<{ badge: BadgeRow }>("/item", { badge_id });
    badge = result.badge;
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "Badge not found",
    };
  }

  if (badge.status !== "pending") {
    return {
      success: false,
      message: "Badge is not pending",
    };
  }

  if (badge.chain_id !== chain.id) {
    return {
      success: false,
      message: "Badge is not on the same chain",
    };
  }

  // 后端也会校验持有人，但这里必须先挡一道：上链发生在调用后端之前，
  // 少了这个检查就会先 mint 出去、再被后端拒绝，凭空多一枚链上代币。
  if (!sameAddress(badge.wallet_address, safe_account_address)) {
    return {
      success: false,
      message: "Badge is not owned by the user",
    };
  }

  let badge_class: BadgeClassRow;
  try {
    const result = await badgeGet<{ badge_class: BadgeClassRow }>("/classes/details", {
      class_id: badge.class_id,
      chain_id: badge.chain_id,
    });
    badge_class = result.badge_class;
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "Badge class not found",
    };
  }

  try {
    // 上链在前、写库在后，中间断掉的话徽章仍是 pending，用户重试就会再 mint
    // 一次。所以先问链上这枚 token 是否已经存在 —— 存在就说明上一次其实成功了，
    // 只是没记上，这次只补记录、不重复铸造。
    const alreadyMinted = await badgeReadClient(chain.id).readContract({
      address: badge_class.badge_contract_address as `0x${string}`,
      abi: badgeUnboundedAbi,
      functionName: "exists",
      args: [BigInt(badge.badge_id)],
    });

    if (alreadyMinted) {
      console.warn(
        `[accept-badge] ${badge.badge_id} 链上已存在但库里仍是 pending，补记录，不重复 mint`
      );
      await badgePost("/accept", {
        badge_id: badge.badge_id,
        wallet_address: safe_account_address,
        chain_id: chain.id,
        recovered: true,
      });

      return {
        success: true,
        message: "Badge accepted successfully",
      };
    }

    const tx = await badgeWalletClient(chain.id).writeContract({
      address: badge_class.badge_contract_address as `0x${string}`,
      abi: badgeUnboundedAbi,
      functionName: "mint",
      args: [badge.wallet_address as `0x${string}`, BigInt(badge.badge_id), BigInt(badge.class_id)],
    });

    console.log("mint badge tx hash =>", tx);

    await badgePost("/accept", {
      badge_id: badge.badge_id,
      wallet_address: safe_account_address,
      chain_id: chain.id,
      tx_hash: tx,
    });

    return {
      success: true,
      message: "Badge accepted successfully",
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: error instanceof BadgeBackendError ? error.message : "Fail to accept badge",
    };
  }
});
