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
