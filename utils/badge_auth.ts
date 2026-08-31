/**
 * Badge 接口的所有权证明。
 *
 * 这些接口需要确认「调用者拥有某个钱包」。原来的做法是把 keystore 和 PIN 一起
 * POST 上去，服务端解密出私钥再取地址——私钥没被用来签名，纯粹为了拿地址，
 * 却让 PIN 明文过网、让明文私钥进了服务端内存。
 *
 * 现在改成：客户端本地解密、签一条挑战消息，只上传地址和签名。PIN 不离开浏览器。
 *
 * 消息把**这次请求的关键参数**都绑进去，所以一个签名只能用于它对应的那一次操作，
 * 不能拿去 accept 另一枚徽章。另外带时间戳，超出窗口即失效。
 */

/** 签名有效期。够慢速网络和用户输 PIN，又不至于让抓到的签名长期可用。 */
export const BADGE_AUTH_TTL_MS = 5 * 60 * 1000;

export type BadgeAuthAction =
  | "create-profile"
  | "create-class"
  | "create-badges"
  | "accept-badge"
  | "reject-badge";

export interface BadgeAuthPayload {
  address: `0x${string}`;
  issued_at: string;
  signature: `0x${string}`;
}

/**
 * 消息文本。两侧必须逐字节一致，所以构造逻辑只此一份。
 *
 * `params` 按 key 排序后逐行拼接，数组用逗号连接——JSON.stringify 的键顺序
 * 依赖对象构造顺序，跨端不可靠。
 */
export function badgeAuthMessage(args: {
  action: BadgeAuthAction;
  chainId: number;
  issuedAt: string;
  params: Record<string, string | number | string[]>;
}): string {
  const lines = [
    "Semi badge authorization",
    `action: ${args.action}`,
    `chain: ${args.chainId}`,
    `issued: ${args.issuedAt}`,
  ];
  for (const key of Object.keys(args.params).sort()) {
    const v = args.params[key];
    lines.push(`${key}: ${Array.isArray(v) ? v.join(",") : v}`);
  }
  return lines.join("\n");
}
