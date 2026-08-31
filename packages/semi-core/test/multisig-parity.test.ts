import { describe, expect, it } from "vitest";
import { concatHex, encodePacked, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { entryPoint07Address } from "viem/account-abstraction";
import { signSafeOpSnapshot, packMultisigSignatures } from "../src/multisig";
import { EIP712_SAFE_OPERATION_TYPE_V07 } from "../src/safe";
import type { UserOpSnapshot, CollectedSignature } from "../src/multisig";

const SAFE_4337_MODULE_ADDRESS = "0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226" as Address;

/** 旧实现，逐字照抄自被替换掉的 utils/SafeSmartAccount/multisig.ts */
async function legacySign(privateKey: Hex, snapshot: UserOpSnapshot) {
  const account = privateKeyToAccount(privateKey);
  const message = {
    safe: snapshot.sender,
    callData: snapshot.callData,
    nonce: BigInt(snapshot.nonce),
    initCode: snapshot.initCode ?? "0x",
    maxFeePerGas: BigInt(snapshot.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(snapshot.maxPriorityFeePerGas),
    preVerificationGas: BigInt(snapshot.preVerificationGas),
    verificationGasLimit: BigInt(snapshot.verificationGasLimit),
    callGasLimit: BigInt(snapshot.callGasLimit),
    paymasterAndData: (snapshot.paymasterAndData ?? "0x") as Hex,
    validAfter: snapshot.validAfter,
    validUntil: snapshot.validUntil,
    entryPoint: entryPoint07Address,
  };
  return account.signTypedData({
    domain: { chainId: snapshot.chainId, verifyingContract: SAFE_4337_MODULE_ADDRESS },
    types: EIP712_SAFE_OPERATION_TYPE_V07,
    primaryType: "SafeOp",
    message,
  });
}

function legacyPack(
  signatures: CollectedSignature[],
  threshold: number,
  validAfter = 0,
  validUntil = 0
): Hex {
  const sorted = [...signatures]
    .sort((a, b) => a.signer_address.toLowerCase().localeCompare(b.signer_address.toLowerCase()))
    .slice(0, threshold);
  const signatureBytes = concatHex(sorted.map((s) => s.signature));
  return encodePacked(["uint48", "uint48", "bytes"], [validAfter, validUntil, signatureBytes]);
}

const SNAPSHOTS: UserOpSnapshot[] = [
  {
    sender: "0x7a3Ed6502F876E4E940Eb34fb33309e8551C5070",
    nonce: "0",
    callData: "0x",
    maxFeePerGas: "1",
    maxPriorityFeePerGas: "1",
    verificationGasLimit: "900000",
    callGasLimit: "240000",
    preVerificationGas: "96000",
    validAfter: 0,
    validUntil: 0,
    initCode: "0x",
    chainId: 10,
  },
  {
    sender: "0xf78B124D0f676153b37b7852658B5000b390984B",
    nonce: "123456789",
    callData: "0x7bb37428000000000000000000000000c0ffee254729296a45a3885639ac7e10f9d54979",
    maxFeePerGas: "12345678901",
    maxPriorityFeePerGas: "1000000",
    verificationGasLimit: "1350000",
    callGasLimit: "288000",
    preVerificationGas: "115200",
    validAfter: 0,
    validUntil: 0,
    factory: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
    factoryData: "0x1688f0b9",
    initCode: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec671688f0b9",
    chainId: 10,
    // 有赞助的情形：paymasterAndData 进签名原像
    paymasterAndData:
      "0x1234567890123456789012345678901234567890000000000000000000013880000000000000000000000000000004e20abcdef",
    paymaster: "0x1234567890123456789012345678901234567890",
    paymasterData: "0xabcdef",
    paymasterVerificationGasLimit: "80000",
    paymasterPostOpGasLimit: "20000",
    sponsored: true,
    paymasterValidUntil: 1893456000,
  },
];

describe("多签签名与旧实现差分", () => {
  const keys = [
    "0x0000000000000000000000000000000000000000000000000000000000000001",
    "0x0000000000000000000000000000000000000000000000000000000000000002",
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  ] as Hex[];

  for (const [i, snapshot] of SNAPSHOTS.entries()) {
    for (const [j, key] of keys.entries()) {
      it(`快照 ${i} × 密钥 ${j}`, async () => {
        const now = await signSafeOpSnapshot(key, snapshot);
        expect(now.signature).toBe(await legacySign(key, snapshot));
      });
    }
  }
});

describe("签名打包与旧实现差分", () => {
  const s = (a: string, sig: string): CollectedSignature => ({
    signer_address: a as Address,
    signature: sig as Hex,
  });
  const cases: { sigs: CollectedSignature[]; threshold: number; va?: number; vu?: number }[] = [
    { sigs: [s("0xAAAA000000000000000000000000000000000001", "0xaa")], threshold: 1 },
    {
      sigs: [
        s("0xCCCC000000000000000000000000000000000003", "0xcc"),
        s("0xAAAA000000000000000000000000000000000001", "0xaa"),
      ],
      threshold: 2,
    },
    {
      sigs: [
        s("0xbbbb000000000000000000000000000000000002", "0xbb"),
        s("0xCCCC000000000000000000000000000000000003", "0xcc"),
        s("0xAAAA000000000000000000000000000000000001", "0xaa"),
      ],
      threshold: 2,
    },
    {
      sigs: [s("0xAAAA000000000000000000000000000000000001", "0xaa")],
      threshold: 1,
      va: 7,
      vu: 99,
    },
  ];

  for (const [i, c] of cases.entries()) {
    it(`用例 ${i}`, () => {
      expect(packMultisigSignatures(c.sigs, c.threshold, c.va ?? 0, c.vu ?? 0)).toBe(
        legacyPack(c.sigs, c.threshold, c.va ?? 0, c.vu ?? 0)
      );
    });
  }
});
