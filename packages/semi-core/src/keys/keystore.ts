import { KeystoreError } from "../errors";
import { getRandomBytes, getSubtle } from "./random";
import { base64ToBytes, bytesToBase64, bytesToHexRaw, hexRawToBytes } from "./hex";

const PBKDF2_ITERATIONS = 100_000;

export interface Keystore {
  version: number;
  crypto: {
    ciphertext: string;
    iv: string;
    salt: string;
    kdf: "pbkdf2";
    cipher: "aes-gcm";
    iterations: number;
    hash: "SHA-256";
  };
}

async function deriveKey(passcode: string, salt: Uint8Array, iterations: number) {
  const subtle = getSubtle();
  const keyMaterial = await subtle.importKey(
    "raw",
    new TextEncoder().encode(passcode),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * 用 PBKDF2 + AES-GCM 加密任意秘密串（助记词或私钥）。
 * 注意：keystore 的强度完全取决于 passcode——这里没有别的熵源。
 */
export async function encryptToKeystore(secret: string, passcode: string): Promise<Keystore> {
  const salt = getRandomBytes(16);
  const iv = getRandomBytes(12);
  const key = await deriveKey(passcode, salt, PBKDF2_ITERATIONS);

  const ciphertext = await getSubtle().encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    new TextEncoder().encode(secret)
  );

  return {
    version: 1,
    crypto: {
      ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
      iv: bytesToHexRaw(iv),
      salt: bytesToHexRaw(salt),
      kdf: "pbkdf2",
      cipher: "aes-gcm",
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
  };
}

function assertKeystore(keystore: unknown): asserts keystore is Keystore {
  const k = keystore as Keystore | null;
  if (!k || typeof k !== "object" || !k.crypto || typeof k.crypto !== "object") {
    throw new KeystoreError("KEYSTORE_MALFORMED", "Invalid keystore: missing `crypto` object");
  }
  for (const field of ["ciphertext", "iv", "salt"] as const) {
    if (typeof k.crypto[field] !== "string" || k.crypto[field].length === 0) {
      throw new KeystoreError(
        "KEYSTORE_MALFORMED",
        `Invalid keystore: missing \`crypto.${field}\``
      );
    }
  }
}

/**
 * 解密 keystore。
 *
 * AES-GCM 的认证标签校验失败和「文件结构坏了」是两种不同的故障，
 * 但 WebCrypto 对前者只抛一个无信息的 OperationError。这里把它翻译成
 * KEYSTORE_BAD_PASSCODE——绝大多数情况下就是口令输错了。
 */
export async function decryptKeystore(keystore: Keystore, passcode: string): Promise<string> {
  assertKeystore(keystore);
  const { ciphertext, iv, salt, iterations } = keystore.crypto;

  const key = await deriveKey(passcode, hexRawToBytes(salt), iterations ?? PBKDF2_ITERATIONS);

  let decrypted: ArrayBuffer;
  try {
    decrypted = await getSubtle().decrypt(
      { name: "AES-GCM", iv: hexRawToBytes(iv) as BufferSource },
      key,
      base64ToBytes(ciphertext) as BufferSource
    );
  } catch (cause) {
    throw new KeystoreError(
      "KEYSTORE_BAD_PASSCODE",
      "Failed to decrypt keystore — wrong passcode, or the file has been tampered with",
      { cause }
    );
  }

  return new TextDecoder().decode(decrypted);
}
