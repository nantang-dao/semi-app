/**
 * 内部编码助手。故意不导出到包外：viem 已经有同名的 `toHex`，
 * 两者语义不同（viem 的返回带 0x 前缀），并存会造成误用。
 */

export function bytesToHexRaw(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexRawToBytes(hex: string): Uint8Array {
  const matched = hex.match(/.{1,2}/g);
  if (!matched) return new Uint8Array(0);
  return Uint8Array.from(matched.map((byte) => parseInt(byte, 16)));
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  // 逐块拼接：字节数组很大时 String.fromCharCode(...bytes) 会爆栈
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
