import { verifyMessage } from "viem";
import { badgeAuthMessage, BADGE_AUTH_TTL_MS, type BadgeAuthAction } from "@/utils/badge_auth";

export class BadgeAuthError extends Error {}

/**
 * 校验所有权证明，返回签名者地址。
 *
 * 服务端在这里只做验签，永远拿不到 keystore 或 PIN。签名覆盖了 action、chain
 * 和本次请求的关键参数，所以换一枚徽章、换一条链都会验不过。
 */
export async function verifyBadgeAuth(args: {
  body: any;
  action: BadgeAuthAction;
  chainId: number;
  params: Record<string, string | number | string[]>;
}): Promise<`0x${string}`> {
  const { address, issued_at, signature } = args.body ?? {};
  if (!address || !issued_at || !signature) {
    throw new BadgeAuthError("Missing authorization");
  }

  const age = Date.now() - new Date(issued_at).getTime();
  if (!Number.isFinite(age)) throw new BadgeAuthError("Invalid authorization timestamp");
  // 允许一点负值：客户端时钟可能略快于服务端
  if (age > BADGE_AUTH_TTL_MS || age < -BADGE_AUTH_TTL_MS) {
    throw new BadgeAuthError("Authorization expired");
  }

  const message = badgeAuthMessage({
    action: args.action,
    chainId: args.chainId,
    issuedAt: issued_at,
    params: args.params,
  });

  const ok = await verifyMessage({ address, message, signature });
  if (!ok) throw new BadgeAuthError("Invalid authorization signature");

  return address as `0x${string}`;
}
