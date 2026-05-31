import { getNamehash } from "@/utils/encryption";

export function getBackendUrl(): string {
  return (process.env.VITE_API_URL || "https://semi.fly.dev").replace(/\/+$/, "");
}

/**
 * Proxy a $fetch call to the backend and re-throw backend errors using H3's
 * createError so the client receives { error: "..." } at e.data.error directly,
 * instead of Nitro's double-wrapped e.data.data.error.
 */
export async function backendFetch<T = any>(url: string, opts?: Parameters<typeof $fetch>[1]): Promise<T> {
  try {
    return await $fetch<T>(url, opts)
  } catch (err: any) {
    throw createError({
      statusCode: err.status ?? err.statusCode ?? 500,
      message: err.data?.error ?? err.message ?? "Backend error",
      data: err.data,
    })
  }
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
