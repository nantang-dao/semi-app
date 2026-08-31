import { badgeGet, type BadgeRow } from "@/server/utils/badge_backend";

export default defineEventHandler(async (event) => {
  const params = getRouterParams(event);
  let { token_id } = params;

  // bigint string to hash
  if (token_id.endsWith("n")) {
    token_id = token_id.slice(0, -1);
  }

  // 将十六进制字符串填充到64个字符（32字节），以匹配 namehash 的固定长度格式
  const token_id_hash = "0x" + BigInt(token_id).toString(16).padStart(64, "0");

  try {
    const result = await badgeGet<{ badge: BadgeRow }>("/item", { badge_id: token_id_hash });
    const badge = result.badge;
    return {
      name: badge.metadata.badge_name,
      description: badge.metadata.badge_description,
      image: badge.metadata.badge_image_url,
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "invalid token id",
    };
  }
});
