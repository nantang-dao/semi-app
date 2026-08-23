import type { Hex } from "viem";
import { decryptKeystore, type Keystore } from "./keystore";
import { isPrivateKey, mnemonicToPrivateKey } from "./mnemonic";

/**
 * 解锁 keystore 得到私钥。
 *
 * keystore 里存的可能是助记词（新建钱包），也可能是裸私钥（从别处导入），
 * 两种都要支持——所以解开之后按格式判断。
 */
export async function keystoreToPrivateKey(keystore: Keystore, passcode: string): Promise<Hex> {
  const secret = await decryptKeystore(keystore, passcode);
  return isPrivateKey(secret) ? secret : mnemonicToPrivateKey(secret);
}
