/**
 * WebCrypto 在浏览器和 Node 18+ 都是全局的，不需要 require("crypto") 兜底
 * ——那个兜底在 ESM 下本来就是坏的（require 未定义）。
 */
export function getRandomBytes(length: number): Uint8Array {
  const crypto = globalThis.crypto;
  if (!crypto?.getRandomValues) {
    throw new Error("WebCrypto is unavailable: globalThis.crypto.getRandomValues is missing");
  }
  return crypto.getRandomValues(new Uint8Array(length));
}

export function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error(
      "WebCrypto SubtleCrypto is unavailable. In browsers this requires a secure context (HTTPS or localhost)."
    );
  }
  return subtle;
}
