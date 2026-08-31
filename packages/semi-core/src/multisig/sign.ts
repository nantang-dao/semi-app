import { concatHex, encodePacked, hashTypedData, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ENTRY_POINT_07_ADDRESS, SAFE_4337_MODULE_ADDRESS } from "../chains";
import { EIP712_SAFE_OPERATION_TYPE_V07 } from "../safe";
import { SnapshotHashMismatchError } from "../errors";
import { assertValidSnapshot, type CollectedSignature, type UserOpSnapshot } from "./types";

/**
 * 快照对应的 EIP-712 typed data。
 *
 * 签名和算哈希共用这一个构造器，两者不可能漂移——如果分开写，某天有人只改
 * 了一处，哈希校验就会在不该报警的地方报警，或者更糟：在该报警的地方沉默。
 */
function safeOpTypedData(snapshot: UserOpSnapshot) {
  return {
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
  } as const;
}

/**
 * 算这份快照的 SafeOp EIP-712 哈希——也就是每个 owner 实际签下去的那个值。
 *
 * 它是快照全部被签字段的指纹：改动其中任何一个字节，哈希就变。提案时把它记
 * 下来，收签时重算比对，就能发现快照在往返途中被改过。
 */
export function safeOpHash(snapshot: UserOpSnapshot): Hex {
  return hashTypedData(safeOpTypedData(snapshot));
}

export interface SignSnapshotOptions {
  /**
   * 从**另一条渠道**拿到的哈希（提案时展示给用户的、链接里带的、或本地留存
   * 的那一份），签名前拿它跟重算结果比对。
   *
   * 这才是真正的防篡改检查。快照里自带的 `safeOpHash` 只能发现**意外**损坏
   * ——协调层要是能改快照，同样能改那个字段。
   */
  expectedHash?: Hex;
}

/**
 * 对快照签名。不需要联网，也不需要 bundler——每个 owner 可以独立完成，
 * 这正是多签能异步收签的原因。
 *
 * message 的每个字段都必须和 executeMultisigUserOp 最终提交的完全一致，
 * 否则链上 checkSignatures 会 revert。
 *
 * 签名前先算一遍 SafeOp 哈希并比对（见 SignSnapshotOptions）：签名承诺的是
 * 这份快照的全部内容，签下去之前必须确认它还是提案时的那一份。
 */
export async function signSafeOpSnapshot(
  privateKey: Hex,
  snapshot: UserOpSnapshot,
  options: SignSnapshotOptions = {}
): Promise<CollectedSignature> {
  assertValidSnapshot(snapshot);

  const actual = safeOpHash(snapshot);
  if (options.expectedHash && options.expectedHash.toLowerCase() !== actual.toLowerCase()) {
    throw new SnapshotHashMismatchError(options.expectedHash, actual, "you were given");
  }
  if (snapshot.safeOpHash && snapshot.safeOpHash.toLowerCase() !== actual.toLowerCase()) {
    throw new SnapshotHashMismatchError(snapshot.safeOpHash, actual, "recorded in the snapshot");
  }

  const account = privateKeyToAccount(privateKey);
  const signature = await account.signTypedData(safeOpTypedData(snapshot));

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
