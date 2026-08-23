import { english, generateMnemonic, mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import { bytesToHexRaw } from "./hex";

const PRIVATE_KEY_RE = /^0x[0-9a-fA-F]{64}$/;

export function isPrivateKey(value: string): value is Hex {
  return PRIVATE_KEY_RE.test(value);
}

/** 生成 BIP-39 助记词（英文词表，12 词） */
export function generateMnemonicPhrase(): string {
  return generateMnemonic(english);
}

/** 取 BIP-44 默认路径 m/44'/60'/0'/0/0 的私钥 */
export function mnemonicToPrivateKey(mnemonic: string): Hex {
  const hdKey = mnemonicToAccount(mnemonic).getHdKey();
  if (!hdKey.privateKey) {
    throw new Error("Derived HD key has no private key");
  }
  return `0x${bytesToHexRaw(hdKey.privateKey)}`;
}

export function mnemonicToAddress(mnemonic: string): Address {
  return mnemonicToAccount(mnemonic).address;
}

/**
 * 私钥对应的 EOA 地址。
 *
 * 注意这是 **signer** 的地址，不是 Safe 智能账户地址——后者要用
 * `predictSafeAddress`。原来叫 `privateKeyToSafeAccount`，名字有误导性。
 */
export function privateKeyToAddress(privateKey: Hex): Address {
  return privateKeyToAccount(privateKey).address;
}
