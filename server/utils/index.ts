import { getNamehash } from "@/utils/encryption";

export function getBackendUrl(): string {
  return (process.env.VITE_API_URL || "https://api.semi.im").replace(/\/+$/, "");
}

export function getProfileId(wallet_address: string, chain_id: number) {
  return getNamehash(`${wallet_address}.${chain_id}.semi`);
}

export function getBadgeClassId(class_id: string, wallet_address: string, chain_id: number) {
  return getNamehash(`${class_id}.${wallet_address}.${chain_id}.semi`);
}

export function getBadgeId(
  badge_id: string,
  class_id: string,
  wallet_address: string,
  chain_id: number
) {
  console.log("getBadgeId str =>", `${badge_id}.${class_id}.${wallet_address}.${chain_id}.semi`);
  return getNamehash(`${badge_id}.${class_id}.${wallet_address}.${chain_id}.semi`);
}
