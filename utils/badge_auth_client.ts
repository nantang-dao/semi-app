import { privateKeyToAccount } from "viem/accounts";
import { keystoreToPrivateKey } from "semi-core/keys";
import { KeystoreError } from "semi-core";
import { badgeAuthMessage, type BadgeAuthAction, type BadgeAuthPayload } from "@/utils/badge_auth";

/**
 * 本地解密 keystore，签一条挑战消息。PIN 和私钥都不离开这个函数。
 *
 * 解密失败（PIN 错）会抛 KeystoreError，调用方按原来的 "Invalid passcode"
 * 提示处理即可——只是判断从服务端挪到了客户端，用户看到的一样。
 */
export async function signBadgeAuth(args: {
  keystoreJson: string;
  pinCode: string;
  action: BadgeAuthAction;
  chainId: number;
  params: Record<string, string | number | string[]>;
}): Promise<BadgeAuthPayload> {
  const privateKey = await keystoreToPrivateKey(JSON.parse(args.keystoreJson), args.pinCode);
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const issued_at = new Date().toISOString();
  const message = badgeAuthMessage({
    action: args.action,
    chainId: args.chainId,
    issuedAt: issued_at,
    params: args.params,
  });
  const signature = await account.signMessage({ message });
  return { address: account.address, issued_at, signature };
}

/**
 * 解密失败（PIN 错）与其它错误的区分，供调用方给出准确提示。
 *
 * 用 instanceof 而不是比对 `error.name`：构建产物会压缩类名。
 */
export function isKeystoreError(error: unknown): boolean {
  return error instanceof KeystoreError;
}
