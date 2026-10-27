import { describe, expect, it } from "vitest";
import {
  encryptToKeystore,
  encryptToKeystoreV2,
  decryptKeystore,
  decryptKeystoreV2,
  decryptKeystoreV2WithParts,
  deriveKeystorePasscodeParts,
  KeystoreError,
  type Keystore,
} from "../src/index";

const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

async function expectCode(p: Promise<unknown>, code: string) {
  const err = await p.then(() => null, (e) => e);
  expect(err).toBeInstanceOf(KeystoreError);
  expect(err.code).toBe(code);
}

describe("keystore v2（key_share）", () => {
  it("支付码 + key_share 才能解开", async () => {
    const { keystore, keyShare } = await encryptToKeystoreV2(MNEMONIC, "123456");
    expect(keystore.version).toBe(2);
    expect(keystore.crypto.keyShare).toBe(true);
    await expect(decryptKeystoreV2(keystore, "123456", keyShare)).resolves.toBe(MNEMONIC);

    await expectCode(decryptKeystoreV2(keystore, "654321", keyShare), "KEYSTORE_BAD_PASSCODE");
    const wrongShare = keyShare.slice();
    wrongShare[0] = (wrongShare[0] ?? 0) ^ 1;
    await expectCode(decryptKeystoreV2(keystore, "123456", wrongShare), "KEYSTORE_BAD_PASSCODE");
  });

  it("v2 keystore 不能当 v1 解，v1 不能当 v2 解", async () => {
    const { keystore } = await encryptToKeystoreV2(MNEMONIC, "123456");
    await expectCode(decryptKeystore(keystore, "123456"), "KEYSTORE_MALFORMED");
    const v1 = await encryptToKeystore(MNEMONIC, "123456");
    await expectCode(decryptKeystoreV2(v1, "123456", new Uint8Array(32)), "KEYSTORE_MALFORMED");
  });

  it("verifier 由支付码和 salt 决定，与 encPart 不同、与 key_share 无关", async () => {
    const { keystore, verifier, keyShare } = await encryptToKeystoreV2(MNEMONIC, "123456");
    expect(verifier).toMatch(/^[0-9a-f]{64}$/);

    const parts = await deriveKeystorePasscodeParts(keystore.crypto, "123456");
    expect(parts.verifier).toBe(verifier);
    expect(hex(parts.encPart)).not.toBe(verifier);
    await expect(decryptKeystoreV2WithParts(keystore, parts.encPart, keyShare)).resolves.toBe(MNEMONIC);

    expect((await deriveKeystorePasscodeParts(keystore.crypto, "123457")).verifier).not.toBe(verifier);
    const other: Keystore = (await encryptToKeystoreV2(MNEMONIC, "123456")).keystore;
    expect((await deriveKeystorePasscodeParts(other.crypto, "123456")).verifier).not.toBe(verifier);
  });

  // 固定 salt 的向量：改动派生步骤（info 字符串、HKDF 参数）会让已有的 v2 keystore 全部解不开，
  // 这个测试就是用来挡住这种改动的。
  it("派生结果固定", async () => {
    const parts = await deriveKeystorePasscodeParts({ salt: "11".repeat(16), iterations: 100_000 }, "123456");
    expect(parts.verifier).toBe(VERIFIER_VECTOR);
    expect(hex(parts.encPart)).toBe(ENC_PART_VECTOR);
  });
});

const VERIFIER_VECTOR = "5d751759f5230359892ab9c7e371ead55e2f04de50e4491010678b48b7ebbc1b";
const ENC_PART_VECTOR = "348020234edf1175eb2915dbe5750a73175427a610b3e74aa180d28bb96d369c";
