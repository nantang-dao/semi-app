import type { Address, Hex, LocalAccount } from "viem";

/**
 * 绑定签名私钥与 Safe 地址时要签的那句话。
 *
 * 后端（semi-backend app/services/wallet_binding.rb 的 binding_message）用同一句话验签，
 * 两边必须逐字相同；消息里带着账户 id，签名不能拿去给别的账户用。
 */
export function walletBindingMessage(userId: string, activeKey: Address, safeAddress: Address): string {
  return `Semi: bind signing key ${activeKey.toLowerCase()} and wallet ${safeAddress.toLowerCase()} to account ${userId}`;
}

/** 证明持有这把私钥：公钥 + personal_sign 签名，随 set_encrypted_keys 一起上传 */
export async function signWalletBinding(
  account: LocalAccount,
  userId: string,
  safeAddress: Address
): Promise<{ public_key: Hex; signature: Hex }> {
  if (!account.signMessage) throw new Error("account cannot sign messages");
  const signature = await account.signMessage({
    message: walletBindingMessage(userId, account.address, safeAddress),
  });
  return { public_key: account.publicKey, signature };
}
