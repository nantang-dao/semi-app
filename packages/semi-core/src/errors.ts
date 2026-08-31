/** 所有 semi-core 抛出的错误的基类。UI 按 `code` 分支，不要匹配 message 文本。 */
export class SemiCoreError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

/** keystore 解密失败。区分「口令错」和「文件坏」——两者的 UI 提示完全不同。 */
export class KeystoreError extends SemiCoreError {
  constructor(
    code: "KEYSTORE_MALFORMED" | "KEYSTORE_BAD_PASSCODE",
    message: string,
    options?: ErrorOptions
  ) {
    super(code, message, options);
  }
}

/** 请求了一条没有配置的链 */
export class ChainNotConfiguredError extends SemiCoreError {
  readonly chainId: number;
  constructor(chainId: number, configured: number[]) {
    super(
      "CHAIN_NOT_CONFIGURED",
      `Chain ${chainId} is not configured. createSemiCore() was given: ${
        configured.length ? configured.join(", ") : "(none)"
      }`
    );
    this.chainId = chainId;
  }
}

/** createSemiCore 拿到的配置有问题。构造时就抛，不等到发请求。 */
export class ConfigError extends SemiCoreError {
  constructor(message: string) {
    super("INVALID_CONFIG", message);
  }
}

/**
 * RPC 实际连着的链和配置里的 `chain.id` 不一致。
 *
 * 这是**静默故障**里最贵的一种：Safe 的官方部署在各链是同一批地址，所以
 * 连错链算出来的钱包地址往往和对的那条一模一样，看不出问题。真正错的是
 * nonce、余额、是否已部署这些**从链上读来**的东西，而 SafeOp 签名里的
 * chainId 却来自配置。结果是签出一份内容自相矛盾的签名，最后在提交时以
 * AA23 / AA25 之类难懂的方式失败——甚至更糟：签名对另一条链是有效的。
 */
export class ChainMismatchError extends SemiCoreError {
  readonly configured: number;
  readonly actual: number;
  constructor(configured: number, actual: number, rpcUrlHint: string) {
    super(
      "CHAIN_MISMATCH",
      `Configured chain ${configured} but the RPC at ${rpcUrlHint} reports chain ${actual}. ` +
        `Fix the RPC URL for chain ${configured} — signing against a mismatched chain produces ` +
        `signatures and nonces that do not belong together.`
    );
    this.configured = configured;
    this.actual = actual;
  }
}

/** 这条链没有配 paymaster，却要求代付 gas */
export class PaymasterNotConfiguredError extends SemiCoreError {
  constructor(chainId: number) {
    super(
      "PAYMASTER_NOT_CONFIGURED",
      `Gas sponsorship was requested but no paymasterUrl is configured for chain ${chainId}`
    );
  }
}

/** bundler 的 gas 估算失败 */
export class GasEstimationError extends SemiCoreError {
  constructor(message: string, options?: ErrorOptions) {
    super("GAS_ESTIMATION_FAILED", message, options);
  }
}

/** 自付 gas 但账户余额不够预付 */
export class InsufficientFundsError extends SemiCoreError {
  readonly balance: bigint;
  readonly required: bigint;
  constructor(balance: bigint, required: bigint) {
    super(
      "INSUFFICIENT_FUNDS",
      `Smart account cannot prefund this UserOperation: balance ${balance} wei, needs about ${required} wei. Top up the account or enable gas sponsorship.`
    );
    this.balance = balance;
    this.required = required;
  }
}

/** UserOp 提交后失败。aaCode 是 ERC-4337 的错误码（如 AA23）。 */
export class UserOpFailedError extends SemiCoreError {
  readonly aaCode: string | undefined;
  constructor(message: string, aaCode?: string, options?: ErrorOptions) {
    super("USER_OP_FAILED", message, options);
    this.aaCode = aaCode;
  }
}

/** paymaster 的赞助有效期已过。多签收签周期长，这是常见情况。 */
export class PaymasterExpiredError extends SemiCoreError {
  readonly expiredAt: number;
  constructor(expiredAt: number) {
    super(
      "PAYMASTER_EXPIRED",
      `Paymaster sponsorship expired at ${new Date(expiredAt * 1000).toISOString()}. The transaction must be re-proposed to refresh it.`
    );
    this.expiredAt = expiredAt;
  }
}

/** bundler 拒绝了 UserOp。aaCode 是 ERC-4337 错误码。 */
export class BundlerError extends SemiCoreError {
  readonly aaCode: string | undefined;
  constructor(message: string, aaCode?: string) {
    super("BUNDLER_REJECTED", message);
    this.aaCode = aaCode;
  }
}

/** Safe 还停留在预测地址上，链上没有代码，读不了 owner */
export class SafeNotDeployedError extends SemiCoreError {
  readonly address: string;
  constructor(address: string, chainId: number) {
    super(
      "SAFE_NOT_DEPLOYED",
      `Safe ${address} has no code on chain ${chainId} — it is still counterfactual. Execute a transaction from it first.`
    );
    this.address = address;
  }
}

/**
 * 快照的 SafeOp 哈希和记录在案的那份对不上。
 *
 * 快照要序列化进后端、再取回来给下一个签名者用。任何一个字段在往返中被
 * 改动——无论是传输损坏、序列化丢字段，还是协调层被攻破——都会让重算出的
 * 哈希变化。`assertValidSnapshot` 只查字段在不在，查不出值变了；这个查得出。
 */
export class SnapshotHashMismatchError extends SemiCoreError {
  readonly expected: string;
  readonly actual: string;
  constructor(expected: string, actual: string, source: string) {
    super(
      "SNAPSHOT_HASH_MISMATCH",
      `This proposal's SafeOp hash does not match the one ${source}: expected ${expected}, ` +
        `computed ${actual}. The proposal has been altered since it was created — do not sign it.`
    );
    this.expected = expected;
    this.actual = actual;
  }
}

/**
 * 提案超过了 Semi 自己设定的有效期。
 *
 * 与 PaymasterExpiredError 是两回事：那个是 paymaster 的签名到期（技术限制），
 * 这个是我们自己加的收签窗口（策略限制）。分开是为了排查时不会看错原因。
 */
export class SnapshotExpiredError extends SemiCoreError {
  readonly expiredAt: number;
  constructor(expiredAt: number) {
    super(
      "SNAPSHOT_EXPIRED",
      `This multisig proposal passed its collection window on ${new Date(expiredAt * 1000).toISOString()} and must be re-proposed. This is Semi's own limit, not the paymaster's.`
    );
    this.expiredAt = expiredAt;
  }
}
