import { describe, expect, it } from "vitest";
import {
  concatHex,
  encodePacked,
  hashTypedData,
  recoverTypedDataAddress,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { entryPoint07Address } from "viem/account-abstraction";
import {
  signSafeOpSnapshot,
  packMultisigSignatures,
  remainingSigners,
  EIP712_SAFE_OPERATION_TYPE_V07,
  SAFE_4337_MODULE_ADDRESS,
  type UserOpSnapshot,
  type CollectedSignature,
} from "../src/index";

const KEY_A = "0x0000000000000000000000000000000000000000000000000000000000000001" as Hex;
const KEY_B = "0x0000000000000000000000000000000000000000000000000000000000000002" as Hex;
const KEY_C = "0x0000000000000000000000000000000000000000000000000000000000000003" as Hex;

const SNAPSHOT: UserOpSnapshot = {
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

describe("signSafeOpSnapshot", () => {
  it("签出的签名能还原出签名者地址", async () => {
    const { signer_address, signature } = await signSafeOpSnapshot(KEY_A, SNAPSHOT);
    expect(signer_address).toBe(privateKeyToAccount(KEY_A).address);

    const recovered = await recoverTypedDataAddress({
      domain: { chainId: 10, verifyingContract: SAFE_4337_MODULE_ADDRESS },
      types: EIP712_SAFE_OPERATION_TYPE_V07,
      primaryType: "SafeOp",
      message: {
        safe: SNAPSHOT.sender,
        callData: SNAPSHOT.callData,
        nonce: 5n,
        initCode: "0x",
        maxFeePerGas: 1000000n,
        maxPriorityFeePerGas: 500000n,
        preVerificationGas: 96000n,
        verificationGasLimit: 900000n,
        callGasLimit: 240000n,
        paymasterAndData: "0x",
        validAfter: 0,
        validUntil: 0,
        entryPoint: entryPoint07Address,
      },
      signature,
    });
    expect(recovered).toBe(signer_address);
  });

  it("同一份快照签出来的是确定值（ECDSA 用了 RFC6979 确定性 nonce）", async () => {
    const a = await signSafeOpSnapshot(KEY_A, SNAPSHOT);
    const b = await signSafeOpSnapshot(KEY_A, SNAPSHOT);
    expect(a.signature).toBe(b.signature);
  });

  /**
   * 快照里任何一个进 EIP-712 的字段变了，哈希就必须变——否则签名会被复用到
   * 一笔不同的交易上。逐字段验一遍。
   */
  it("每个被签字段的改动都会改变签名", async () => {
    const base = await signSafeOpSnapshot(KEY_A, SNAPSHOT);
    const mutations: Partial<UserOpSnapshot>[] = [
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
      { sender: "0xf78B124D0f676153b37b7852658B5000b390984B" },
      { chainId: 1 },
      { paymasterAndData: "0xabcd" },
    ];
    for (const m of mutations) {
      const changed = await signSafeOpSnapshot(KEY_A, { ...SNAPSHOT, ...m });
      expect(changed.signature, `字段 ${Object.keys(m)[0]} 改动后签名未变`).not.toBe(
        base.signature
      );
    }
  });

  it("缺字段的快照直接拒签，而不是签出错误的哈希", async () => {
    const { nonce, ...broken } = SNAPSHOT;
    await expect(signSafeOpSnapshot(KEY_A, broken as UserOpSnapshot)).rejects.toThrow(
      /missing nonce/
    );
  });
});

describe("packMultisigSignatures", () => {
  const sig = (addr: string, s: string): CollectedSignature => ({
    signer_address: addr as Address,
    signature: s as Hex,
  });

  const A = "0xAAAA000000000000000000000000000000000001";
  const B = "0xbbbb000000000000000000000000000000000002";
  const C = "0xCCCC000000000000000000000000000000000003";

  it("按签名者地址升序拼接——Safe 的 checkSignatures 依赖这个顺序", () => {
    const packed = packMultisigSignatures([sig(C, "0xcc"), sig(A, "0xaa"), sig(B, "0xbb")], 3);
    expect(packed).toBe(
      encodePacked(["uint48", "uint48", "bytes"], [0, 0, concatHex(["0xaa", "0xbb", "0xcc"])])
    );
  });

  it("排序按地址数值而非大小写——A 是大写、B 是小写，仍要排在 B 前", () => {
    const packed = packMultisigSignatures([sig(B, "0xbb"), sig(A, "0xaa")], 2);
    expect(packed.endsWith("aabb")).toBe(true);
  });

  it("签名多于 threshold 时取排序后的前 N 个", () => {
    const packed = packMultisigSignatures([sig(C, "0xcc"), sig(A, "0xaa"), sig(B, "0xbb")], 2);
    expect(packed.endsWith("aabb")).toBe(true);
  });

  it("validAfter / validUntil 进前 12 字节", () => {
    const packed = packMultisigSignatures([sig(A, "0xaa")], 1, 7, 9);
    expect(packed).toBe(encodePacked(["uint48", "uint48", "bytes"], [7, 9, "0xaa"]));
  });

  it("签名不足 threshold 时立刻抛错，而不是提交一个必然失败的 UserOp", () => {
    expect(() => packMultisigSignatures([sig(A, "0xaa")], 2)).toThrow(/Not enough signatures/);
  });

  it("同一签名者的重复签名只算一次", () => {
    expect(() => packMultisigSignatures([sig(A, "0xaa"), sig(A.toLowerCase(), "0xaa")], 2)).toThrow(
      /Not enough signatures/
    );
  });
});

describe("remainingSigners", () => {
  it("列出还没签的 owner，比较时忽略大小写", () => {
    const owners = [
      "0xAAAA000000000000000000000000000000000001",
      "0xBBBB000000000000000000000000000000000002",
    ] as Address[];
    const done = [
      {
        signer_address: "0xaaaa000000000000000000000000000000000001" as Address,
        signature: "0x" as Hex,
      },
    ];
    expect(remainingSigners(owners, done)).toEqual([owners[1]]);
  });
});
