import type { Address, Hex } from "viem";

/**
 * 所有签名者共同承诺的 UserOp 快照。
 *
 * 数值一律用字符串存 —— 这个对象要序列化进后端数据库、再取回来给下一个
 * 签名者用，是**跨进程契约**。JSON 没有 bigint，字段名和形状不能随意改。
 */
export interface UserOpSnapshot {
  sender: Address;
  nonce: string;
  callData: Hex;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  verificationGasLimit: string;
  callGasLimit: string;
  preVerificationGas: string;
  validAfter: number;
  validUntil: number;
  factory?: Address;
  factoryData?: Hex;
  initCode: Hex;
  chainId: number;

  // ── Paymaster 赞助（在建快照时就冻结）──
  // 所有 owner 必须对同一份 paymasterAndData 签名，所以这里锁死。
  // paymasterAndData 是进 EIP-712 SafeOp 哈希的**打包**形式；
  // 下面几个字段是提交给 bundler 的 v0.7 **拆开**形式。两者必须对应。
  paymasterAndData?: Hex;
  paymaster?: Address;
  paymasterData?: Hex;
  paymasterVerificationGasLimit?: string;
  paymasterPostOpGasLimit?: string;
  /** true = paymaster 代付；false = 钱包自付 */
  sponsored?: boolean;
  /** 赞助过期的 unix 秒；0 表示不过期 */
  paymasterValidUntil?: number;
}

export interface CollectedSignature {
  signer_address: Address;
  signature: Hex;
}

const REQUIRED_FIELDS = [
  "sender",
  "nonce",
  "callData",
  "maxFeePerGas",
  "maxPriorityFeePerGas",
  "verificationGasLimit",
  "callGasLimit",
  "preVerificationGas",
  "chainId",
] as const;

/**
 * 校验从后端取回的快照。
 *
 * 快照往返数据库再回来，缺字段不会立刻报错——它会一路走到签名，
 * 算出一个错误的 SafeOp 哈希，最后在链上 checkSignatures 处 revert，
 * 而那已经是收齐所有签名之后了。宁可在这里挡住。
 */
export function assertValidSnapshot(snapshot: unknown): asserts snapshot is UserOpSnapshot {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("Invalid UserOp snapshot: not an object");
  }
  const s = snapshot as Record<string, unknown>;
  const missing = REQUIRED_FIELDS.filter((f) => s[f] === undefined || s[f] === null);
  if (missing.length > 0) {
    throw new Error(`Invalid UserOp snapshot: missing ${missing.join(", ")}`);
  }
}
