import { describe, expect, it } from "vitest";
import { recoverTypedDataAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { entryPoint07Address } from "viem/account-abstraction";
import {
  EIP712_SAFE_OPERATION_TYPE_V07,
  SAFE_4337_MODULE_ADDRESS,
  SnapshotHashMismatchError,
  safeOpHash,
  signSafeOpSnapshot,
  type UserOpSnapshot,
} from "../src/index";

const KEY = "0x0000000000000000000000000000000000000000000000000000000000000001" as Hex;

const BASE: UserOpSnapshot = {
  sender: "0x7a3Ed6502F876E4E940Eb34fb33309e8551C5070",
  nonce: "5",
  callData: "0xdeadbeef",
  maxFeePerGas: "1000000",
  maxPriorityFeePerGas: "500000",
  verificationGasLimit: "900000",
  callGasLimit: "240000",
  preVerificationGas: "96000",
  validAfter: 0,
  validUntil: 0,
  initCode: "0x",
  chainId: 10,
};

const sealed = (s: UserOpSnapshot): UserOpSnapshot => ({ ...s, safeOpHash: safeOpHash(s) });

describe("safeOpHash", () => {
  /**
   * 这个哈希必须就是 owner 实际签下去的那个值，否则比对的是两个不相干的东西。
   */
  it("等于签名恢复时用的那个 EIP-712 哈希", async () => {
    const sig = await signSafeOpSnapshot(KEY, BASE);
    const recovered = await recoverTypedDataAddress({
      domain: { chainId: BASE.chainId, verifyingContract: SAFE_4337_MODULE_ADDRESS },
      types: EIP712_SAFE_OPERATION_TYPE_V07,
      primaryType: "SafeOp",
      message: {
        safe: BASE.sender,
        callData: BASE.callData,
        nonce: BigInt(BASE.nonce),
        initCode: "0x",
        maxFeePerGas: BigInt(BASE.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(BASE.maxPriorityFeePerGas),
        preVerificationGas: BigInt(BASE.preVerificationGas),
        verificationGasLimit: BigInt(BASE.verificationGasLimit),
        callGasLimit: BigInt(BASE.callGasLimit),
        paymasterAndData: "0x",
        validAfter: 0,
        validUntil: 0,
        entryPoint: entryPoint07Address,
      },
      signature: sig.signature,
    });
    expect(recovered).toBe(privateKeyToAccount(KEY).address);
    expect(safeOpHash(BASE)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  /**
   * 逐个改动被签字段，哈希都必须变——否则某个字段被改了却查不出来，而它照样
   * 进签名，链上就会以 AA24 拒绝，那已经是收齐全部签名之后了。
   */
  it("任何一个被签字段变了，哈希就变", () => {
    const base = safeOpHash(BASE);
    const mutations: Partial<UserOpSnapshot>[] = [
      { sender: "0x0000000000000000000000000000000000000009" },
      { nonce: "6" },
      { callData: "0xdeadbeee" },
      { maxFeePerGas: "1000001" },
      { maxPriorityFeePerGas: "500001" },
      { verificationGasLimit: "900001" },
      { callGasLimit: "240001" },
      { preVerificationGas: "96001" },
      { validAfter: 1 },
      { validUntil: 1 },
      { initCode: "0xab" },
      { chainId: 1 },
      { paymasterAndData: "0xab" },
    ];
    for (const m of mutations) {
      expect(safeOpHash({ ...BASE, ...m }), JSON.stringify(m)).not.toBe(base);
    }
  });

  /** 这些字段不进签名，改了不该影响哈希——否则会误报。 */
  it("不进签名的字段不影响哈希", () => {
    const base = safeOpHash(BASE);
    expect(safeOpHash({ ...BASE, expiresAt: 123 })).toBe(base);
    expect(safeOpHash({ ...BASE, sponsored: true })).toBe(base);
    expect(safeOpHash({ ...BASE, paymasterValidUntil: 999 })).toBe(base);
    expect(safeOpHash({ ...BASE, safeOpHash: "0x00" })).toBe(base);
  });
});

describe("签名前的哈希比对", () => {
  it("快照没被动过就正常签", async () => {
    await expect(signSafeOpSnapshot(KEY, sealed(BASE))).resolves.toHaveProperty("signature");
  });

  it("快照里的字段被改过就拒签", async () => {
    const tampered = { ...sealed(BASE), callData: "0xc0ffee" as Hex };
    await expect(signSafeOpSnapshot(KEY, tampered)).rejects.toBeInstanceOf(
      SnapshotHashMismatchError
    );
    await expect(signSafeOpSnapshot(KEY, tampered)).rejects.toThrow(/do not sign it/);
  });

  /**
   * 快照自带的哈希只防意外损坏：能改快照的一方同样能改那个字段。真正的
   * 防篡改是把提案时的哈希从另一条渠道带给签名者，用 expectedHash 比对。
   */
  it("expectedHash 能识破「快照和自带哈希被一起改掉」", async () => {
    const original = sealed(BASE);
    const forged = sealed({ ...BASE, callData: "0xc0ffee" as Hex }); // 哈希也被重算了
    await expect(signSafeOpSnapshot(KEY, forged)).resolves.toHaveProperty("signature");
    await expect(
      signSafeOpSnapshot(KEY, forged, { expectedHash: original.safeOpHash })
    ).rejects.toBeInstanceOf(SnapshotHashMismatchError);
  });

  it("旧快照没有 safeOpHash 字段，跳过检查照常签", async () => {
    await expect(signSafeOpSnapshot(KEY, BASE)).resolves.toHaveProperty("signature");
  });

  it("哈希大小写不影响比对", async () => {
    const s = sealed(BASE);
    const upper = s.safeOpHash!.toUpperCase().replace("0X", "0x") as Hex;
    await expect(signSafeOpSnapshot(KEY, { ...s, safeOpHash: upper })).resolves.toBeTruthy();
    await expect(
      signSafeOpSnapshot(KEY, s, { expectedHash: upper })
    ).resolves.toBeTruthy();
  });
});
