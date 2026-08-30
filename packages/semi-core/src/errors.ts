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
