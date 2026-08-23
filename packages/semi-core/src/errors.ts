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
