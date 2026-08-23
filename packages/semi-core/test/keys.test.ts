import { describe, expect, it } from "vitest";
import { entryPoint07Address } from "viem/account-abstraction";
import {
  ENTRY_POINT_07_ADDRESS,
  SAFE_4337_MODULE_ADDRESS,
  encryptToKeystore,
  decryptKeystore,
  keystoreToPrivateKey,
  generateMnemonicPhrase,
  mnemonicToAddress,
  mnemonicToPrivateKey,
  privateKeyToAddress,
  isPrivateKey,
  namehash,
  getSafeDeployment,
  KeystoreError,
  type Keystore,
} from "../src/index";

// BIP-39 官方测试向量（"abandon" x11 + "about"），配 BIP-44 以太坊默认路径
// m/44'/60'/0'/0/0。这些值来自规范，不是从本实现里跑出来的。
const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const TEST_ADDRESS = "0x9858EfFD232B4033E47d90003D41EC34EcaEda94";
const TEST_PRIVATE_KEY = "0x1ab42cc412b618bdea3a599e3c9bae199ebf030895b039e9db1e30dafb12b727";

describe("助记词与私钥", () => {
  it("按 BIP-44 默认路径派生出规范里的私钥", () => {
    expect(mnemonicToPrivateKey(TEST_MNEMONIC)).toBe(TEST_PRIVATE_KEY);
  });

  it("助记词地址与私钥地址一致", () => {
    expect(mnemonicToAddress(TEST_MNEMONIC)).toBe(TEST_ADDRESS);
    expect(privateKeyToAddress(TEST_PRIVATE_KEY)).toBe(TEST_ADDRESS);
  });

  it("生成的助记词是 12 个词且可用", () => {
    const mnemonic = generateMnemonicPhrase();
    expect(mnemonic.split(" ")).toHaveLength(12);
    expect(mnemonicToAddress(mnemonic)).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("每次生成的助记词都不同", () => {
    expect(generateMnemonicPhrase()).not.toBe(generateMnemonicPhrase());
  });

  it("isPrivateKey 只认 0x + 64 位十六进制", () => {
    expect(isPrivateKey(TEST_PRIVATE_KEY)).toBe(true);
    expect(isPrivateKey(TEST_MNEMONIC)).toBe(false);
    expect(isPrivateKey(TEST_PRIVATE_KEY.slice(0, -1))).toBe(false); // 少一位
    expect(isPrivateKey(TEST_PRIVATE_KEY + "0")).toBe(false); // 多一位
    expect(isPrivateKey(TEST_PRIVATE_KEY.slice(2))).toBe(false); // 缺 0x
  });
});

describe("keystore", () => {
  it("助记词加密后能原样解回", async () => {
    const keystore = await encryptToKeystore(TEST_MNEMONIC, "hunter2");
    expect(await decryptKeystore(keystore, "hunter2")).toBe(TEST_MNEMONIC);
  });

  it("相同明文与口令，两次加密的密文不同（salt/iv 随机）", async () => {
    const a = await encryptToKeystore(TEST_MNEMONIC, "hunter2");
    const b = await encryptToKeystore(TEST_MNEMONIC, "hunter2");
    expect(a.crypto.ciphertext).not.toBe(b.crypto.ciphertext);
    expect(a.crypto.salt).not.toBe(b.crypto.salt);
    expect(a.crypto.iv).not.toBe(b.crypto.iv);
  });

  it("口令错误抛 KEYSTORE_BAD_PASSCODE", async () => {
    const keystore = await encryptToKeystore(TEST_MNEMONIC, "hunter2");
    await expect(decryptKeystore(keystore, "wrong")).rejects.toMatchObject({
      code: "KEYSTORE_BAD_PASSCODE",
    });
  });

  it("密文被篡改也抛 KEYSTORE_BAD_PASSCODE（GCM 认证标签生效）", async () => {
    const keystore = await encryptToKeystore(TEST_MNEMONIC, "hunter2");
    const flipped = keystore.crypto.ciphertext.replace(/^./, (c) => (c === "A" ? "B" : "A"));
    const tampered: Keystore = {
      ...keystore,
      crypto: { ...keystore.crypto, ciphertext: flipped },
    };
    await expect(decryptKeystore(tampered, "hunter2")).rejects.toBeInstanceOf(KeystoreError);
  });

  it("结构损坏抛 KEYSTORE_MALFORMED，而不是当成口令错", async () => {
    for (const bad of [null, {}, { crypto: {} }, { crypto: { ciphertext: "x", iv: "" } }]) {
      await expect(decryptKeystore(bad as never, "hunter2")).rejects.toMatchObject({
        code: "KEYSTORE_MALFORMED",
      });
    }
  });
});

describe("keystoreToPrivateKey", () => {
  it("存的是助记词时，派生出私钥", async () => {
    const keystore = await encryptToKeystore(TEST_MNEMONIC, "pw");
    expect(await keystoreToPrivateKey(keystore, "pw")).toBe(TEST_PRIVATE_KEY);
  });

  it("存的是裸私钥时，原样返回（导入的钱包走这条路）", async () => {
    const keystore = await encryptToKeystore(TEST_PRIVATE_KEY, "pw");
    expect(await keystoreToPrivateKey(keystore, "pw")).toBe(TEST_PRIVATE_KEY);
  });
});

describe("namehash", () => {
  // EIP-137 规范给出的值
  it("匹配 EIP-137 的测试向量", () => {
    expect(namehash("")).toBe("0x0000000000000000000000000000000000000000000000000000000000000000");
    expect(namehash("eth")).toBe(
      "0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae"
    );
    expect(namehash("foo.eth")).toBe(
      "0xde9b09fd7c5f901e23a3f19fecc54828e9c848539801e86591bd9801b019f84f"
    );
  });
});

describe("链上常量", () => {
  it("EntryPoint 0.7 地址与 viem 的一致", () => {
    expect(ENTRY_POINT_07_ADDRESS).toBe(entryPoint07Address);
  });

  it("4337 module 常量与部署表里的字段一致", () => {
    // 原来 multisig.ts 里硬编码了一份，和部署表是两处来源。合并后要保证同值。
    for (const chainId of [1, 10, 11155111]) {
      expect(getSafeDeployment(chainId).safe_4337_module).toBe(SAFE_4337_MODULE_ADDRESS);
    }
  });

  it("Optimism 的 safe_to_l2_setup 与其他链不同", () => {
    expect(getSafeDeployment(10).safe_to_l2_setup).toBe(
      "0xBD89A1CE4DDe368FFAB0eC35506eEcE0b1fFdc54"
    );
    expect(getSafeDeployment(1).safe_to_l2_setup).toBe(
      "0xfF83F6335d8930cBad1c0D439A841f01888D9f69"
    );
  });

  it("未知链抛错而不是返回 undefined", () => {
    expect(() => getSafeDeployment(999999)).toThrow(/No Safe v1.4.1 deployment/);
  });
});
