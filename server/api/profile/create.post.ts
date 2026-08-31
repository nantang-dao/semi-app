import { verifyBadgeAuth, BadgeAuthError } from "@/server/utils/badge_auth";
import { predictSafeAccountAddress } from "@/utils/SafeSmartAccount";
import { sepolia, mainnet, optimism } from "viem/chains";
import { getProfileId } from "@/server/utils";
import { badgeWalletClient } from "@/server/utils/badge_wallet";
import { profileRegistryAbi } from "@/server/utils/solar_badge";
import { sola_badge_contract_address } from "@/server/utils/solar_badge/contracts";
import { badgeGet, badgePost, type BadgeProfileRow } from "@/server/utils/badge_backend";

const chains = {
  "11155111": sepolia,
  "1": mainnet,
  "10": optimism,
} as const;

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  const { chain_id } = body;

  if (!chain_id) {
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
      action: "create-profile",
      chainId: chain.id,
      params: {},
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

  try {
    const existing = await badgeGet<{ profile: BadgeProfileRow | null }>("/profile", {
      wallet_address: safe_account_address,
      chain_id: chain.id,
    });
    if (existing.profile) {
      // 已经有了就直接返回，而不是原来的 undefined —— 调用方拿到 undefined
      // 只能靠猜，分不清「已存在」和「出错了」。
      return {
        success: true,
        message: "Profile already exists",
        data: {
          profile_id: existing.profile.profile_id,
          tx_hash: existing.profile.tx_hash,
        },
      };
    }

    const create_profile_hash = await badgeWalletClient(chain.id).writeContract({
      address: contract_addresses.profile_registry as `0x${string}`,
      abi: profileRegistryAbi,
      functionName: "createProfile",
      args: [safe_account_address as `0x${string}`, BigInt(profile_id), true],
    });
    console.log("create profile tx hash", create_profile_hash);

    await badgePost("/profile", {
      profile_id,
      wallet_address: safe_account_address,
      chain_id: chain.id,
      tx_hash: create_profile_hash,
    });

    return {
      success: true,
      message: "Profile created successfully",
      data: {
        profile_id,
        tx_hash: create_profile_hash,
      },
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "Failed to create profile",
    };
  }
});
