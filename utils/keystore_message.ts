import { sha256, stringToBytes } from "viem";

/**
 * update_keystore 要签的那句话。后端 app/services/keystore_vault.rb 的 update_message 用同一句话
 * 验签，两边必须逐字相同（semi-backend test/services/keystore_vault_test.rb 有 viem 签的向量）。
 */
export function keystoreUpdateMessage(
  userId: string,
  issuedAt: number,
  encryptedKeys: string,
  verifier: string,
  keyShare: string
): string {
  const digest = sha256(stringToBytes(`${encryptedKeys}\n${verifier}\n${keyShare}`)).slice(2);
  return `Semi: update keystore of account ${userId} at ${issuedAt} sha256:${digest}`;
}
