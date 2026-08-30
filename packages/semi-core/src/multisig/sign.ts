import { concatHex, encodePacked, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ENTRY_POINT_07_ADDRESS, SAFE_4337_MODULE_ADDRESS } from "../chains";
import { EIP712_SAFE_OPERATION_TYPE_V07 } from "../safe";
import { assertValidSnapshot, type CollectedSignature, type UserOpSnapshot } from "./types";

/**
 * 对快照签名。不需要联网，也不需要 bundler——每个 owner 可以独立完成，
 * 这正是多签能异步收签的原因。
 *
 * message 的每个字段都必须和 executeMultisigUserOp 最终提交的完全一致，
 * 否则链上 checkSignatures 会 revert。
 */
export async function signSafeOpSnapshot(
  privateKey: Hex,
  snapshot: UserOpSnapshot
): Promise<CollectedSignature> {
  assertValidSnapshot(snapshot);
  const account = privateKeyToAccount(privateKey);

  const signature = await account.signTypedData({
    domain: {
      chainId: snapshot.chainId,
      verifyingContract: SAFE_4337_MODULE_ADDRESS,
    },
    types: EIP712_SAFE_OPERATION_TYPE_V07,
    primaryType: "SafeOp",
    message: {
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
      entryPoint: ENTRY_POINT_07_ADDRESS,
    },
  });

  return { signer_address: account.address, signature };
}

/**
 * 把收集到的签名打包成 Safe 期待的形式。
 *
 * **按签名者地址升序排列是强制的** —— Safe 的 checkSignatures 依赖这个顺序
 * 去线性扫描 owner 链表，顺序错了会判定为无效签名。多收的签名按序取前
 * threshold 个。
 */
export function packMultisigSignatures(
  signatures: CollectedSignature[],
  threshold: number,
  validAfter = 0,
  validUntil = 0
): Hex {
  const unique = new Map<string, CollectedSignature>();
  for (const s of signatures) unique.set(s.signer_address.toLowerCase(), s);

  const sorted = [...unique.values()].sort((a, b) =>
    a.signer_address.toLowerCase().localeCompare(b.signer_address.toLowerCase())
  );

  if (sorted.length < threshold) {
    throw new Error(
      `Not enough signatures: have ${sorted.length} from distinct signers, need ${threshold}`
    );
  }

  const signatureBytes = concatHex(sorted.slice(0, threshold).map((s) => s.signature));
  return encodePacked(["uint48", "uint48", "bytes"], [validAfter, validUntil, signatureBytes]);
}

/** 已签名的地址集合（小写），用于判断还差谁 */
export function signedBy(signatures: CollectedSignature[]): Set<string> {
  return new Set(signatures.map((s) => s.signer_address.toLowerCase()));
}

export function remainingSigners(owners: Address[], signatures: CollectedSignature[]): Address[] {
  const done = signedBy(signatures);
  return owners.filter((o) => !done.has(o.toLowerCase()));
}
