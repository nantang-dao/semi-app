import { english, generateMnemonic } from "viem/accounts";

/**
 * 生成 BIP-39 助记词（英文词表，12 词）。
 *
 * 单独成一个模块，是因为 `english` 是 2048 个词的常量表（打包后 12.3 KB gzip，
 * 和 HD 派生代码同处一个 chunk）。解锁 keystore 只需要 `mnemonicToPrivateKey`，
 * 而它走的是 `mnemonicToSeedSync`（对短语做 PBKDF2），**不查词表**。
 * 两者放在同一模块里，转账等只解锁不生成的页面也会被迫加载整张词表。
 */
export function generateMnemonicPhrase(): string {
  return generateMnemonic(english);
}
