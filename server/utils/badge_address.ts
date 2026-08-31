import { getAddress, isAddress } from "viem";

/**
 * 地址大小写在徽章这块是有后果的，不是风格问题。
 *
 * profile_id / class_id / badge_id 都是 namehash("<...>.<wallet_address>.<chain>.semi")
 * 算出来的，地址的大小写变了，id 就完全不同，跟链上对不上。
 *
 * 历史上 profile 和 class 的地址来自 predictSafeAccountAddress()（必然 checksummed），
 * 而 badge 的收件人地址是调用方原样传进来的 —— 于是库里混进了 4 条全小写的记录，
 * 它们的持有人既查不到、也领不了。这里的工具就是为了让两边都能对上。
 */

/** 转成 checksummed 形式；不是合法地址就抛。新写入一律走这里。 */
export function normalizeAddress(value: string): `0x${string}` {
  if (!isAddress(value, { strict: false })) {
    throw new Error(`Invalid address: ${value}`);
  }
  return getAddress(value);
}

/**
 * 查询用：同一个地址在库里可能以 checksummed 或全小写存在，两种都要查。
 * Instant 的 where 没有大小写不敏感匹配，只能用 $in 穷举。
 */
export function addressVariants(value: string): string[] {
  const lower = value.toLowerCase();
  if (!isAddress(value, { strict: false }))
    return [value, lower].filter((v, i, a) => a.indexOf(v) === i);
  const checksummed = getAddress(value);
  return checksummed === lower ? [checksummed] : [checksummed, lower];
}

/** 比较两个地址是否指向同一账户，忽略大小写。 */
export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}
