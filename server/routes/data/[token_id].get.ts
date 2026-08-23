import db from "@/server/utils/db";

export default defineEventHandler(async (event) => {
  const params = getRouterParams(event);
  let { token_address, token_id } = params;

  // bigint string to hash
  if (token_id.endsWith("n")) {
    token_id = token_id.slice(0, -1);
  }

  // 将十六进制字符串填充到64个字符（32字节），以匹配 namehash 的固定长度格式
  const token_id_hash = "0x" + BigInt(token_id).toString(16).padStart(64, "0");

  console.log(
    "token_id_hash",
    token_id_hash === "0x0342cef1b0951f11480f74dce03cde5b552e9dd88bb8579a292f235b68ca9cdd"
  );

  const queryBadge = await db.query({
    badges: {
      $: {
        where: {
          badge_id: token_id_hash,
        },
      },
    },
  });

  if (queryBadge.badges.length === 0) {
    return {
      success: false,
      message: "invalid token id",
    };
  }

  const badge = queryBadge.badges[0];

  return {
    name: badge.metadata.badge_name,
    description: badge.metadata.badge_description,
    image: badge.metadata.badge_image_url,
  };
});
