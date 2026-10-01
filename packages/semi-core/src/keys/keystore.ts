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
    /** v2：解密还要服务端的 key_share，见 encryptToKeystoreV2 */
    keyShare?: true;
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
  if (keystore.crypto.keyShare) {
    throw new KeystoreError("KEYSTORE_MALFORMED", "This is a v2 keystore: it also needs the server's key_share");
  }
  const { salt, iterations } = keystore.crypto;
  const key = await deriveKey(passcode, hexRawToBytes(salt), iterations ?? PBKDF2_ITERATIONS);
  return decryptWith(keystore, key);
}

async function decryptWith(keystore: Keystore, key: CryptoKey): Promise<string> {
  const { ciphertext, iv } = keystore.crypto;
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

// ---------------------------------------------------------------------------
// v2：解密密钥由支付码派生的一半和服务端的 key_share 合成，服务端核对 verifier 后才下发
// key_share，并限制失败次数。6 位支付码在 v1 下可被离线穷举（10⁶ 种），v2 把它变成在线猜测。
// 服务端对应 semi-backend app/services/keystore_vault.rb，设计见 semi-backend docs/keystore.md。
//
//   pin_key  = PBKDF2-SHA256(passcode, salt, iterations)
//   verifier = HKDF(pin_key, info "semi-keystore-v2/verify")    → 发给服务端
//   enc_part = HKDF(pin_key, info "semi-keystore-v2/encrypt")   → 从不离开客户端
//   aes_key  = HKDF(enc_part ‖ key_share, salt, info "semi-keystore-v2/aes")
// ---------------------------------------------------------------------------

const KEY_SHARE_BYTES = 32;

/** 支付码派生出的两半：verifier 交给服务端核对，encPart 留在本地参与解密 */
export interface KeystorePasscodeParts {
  /** 32 字节 hex（无 0x） */
  verifier: string;
  encPart: Uint8Array;
}

async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: string): Promise<Uint8Array> {
  const subtle = getSubtle();
  const base = await subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
  const bits = await subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: new TextEncoder().encode(info) },
    base,
    256
  );
  return new Uint8Array(bits);
}

async function pinKey(passcode: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const subtle = getSubtle();
  const material = await subtle.importKey("raw", new TextEncoder().encode(passcode), "PBKDF2", false, ["deriveBits"]);
  const bits = await subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    material,
    256
  );
  return new Uint8Array(bits);
}

/** 按 keystore 里的 salt / 迭代次数，从支付码算出 verifier 和 encPart（只跑一次 PBKDF2） */
export async function deriveKeystorePasscodeParts(
  params: { salt: string; iterations: number },
  passcode: string
): Promise<KeystorePasscodeParts> {
  const pin = await pinKey(passcode, hexRawToBytes(params.salt), params.iterations);
  const empty = new Uint8Array(0);
  const [verifier, encPart] = await Promise.all([
    hkdf(pin, empty, "semi-keystore-v2/verify"),
    hkdf(pin, empty, "semi-keystore-v2/encrypt"),
  ]);
  pin.fill(0);
  return { verifier: bytesToHexRaw(verifier), encPart };
}

async function v2AesKey(encPart: Uint8Array, keyShare: Uint8Array, salt: Uint8Array): Promise<CryptoKey> {
  if (keyShare.length !== KEY_SHARE_BYTES) {
    throw new KeystoreError("KEYSTORE_MALFORMED", "key_share must be 32 bytes");
  }
  const ikm = new Uint8Array(encPart.length + keyShare.length);
  ikm.set(encPart);
  ikm.set(keyShare, encPart.length);
  const raw = await hkdf(ikm, salt, "semi-keystore-v2/aes");
  ikm.fill(0);
  const key = await getSubtle().importKey("raw", raw as BufferSource, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  raw.fill(0);
  return key;
}

/**
 * 加密成 v2 keystore。返回的 verifier 和 keyShare 要随 keystore 一起交给服务端
 * （set_encrypted_keys / update_keystore），服务端只存它们的 HMAC / 密文。
 */
export async function encryptToKeystoreV2(
  secret: string,
  passcode: string
): Promise<{ keystore: Keystore; verifier: string; keyShare: Uint8Array }> {
  const salt = getRandomBytes(16);
  const iv = getRandomBytes(12);
  const keyShare = getRandomBytes(KEY_SHARE_BYTES);
  const { verifier, encPart } = await deriveKeystorePasscodeParts(
    { salt: bytesToHexRaw(salt), iterations: PBKDF2_ITERATIONS },
    passcode
  );
  const key = await v2AesKey(encPart, keyShare, salt);
  encPart.fill(0);

  const ciphertext = await getSubtle().encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    new TextEncoder().encode(secret)
  );

  return {
    keystore: {
      version: 2,
      crypto: {
        ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
        iv: bytesToHexRaw(iv),
        salt: bytesToHexRaw(salt),
        kdf: "pbkdf2",
        cipher: "aes-gcm",
        iterations: PBKDF2_ITERATIONS,
        hash: "SHA-256",
        keyShare: true,
      },
    },
    verifier,
    keyShare,
  };
}

/** 用已经算好的 encPart 解 v2 keystore（解锁时 verifier 和 encPart 来自同一次 PBKDF2） */
export async function decryptKeystoreV2WithParts(
  keystore: Keystore,
  encPart: Uint8Array,
  keyShare: Uint8Array
): Promise<string> {
  assertKeystore(keystore);
  if (!keystore.crypto.keyShare) {
    throw new KeystoreError("KEYSTORE_MALFORMED", "Not a v2 keystore");
  }
  const key = await v2AesKey(encPart, keyShare, hexRawToBytes(keystore.crypto.salt));
  return decryptWith(keystore, key);
}

/** 解 v2 keystore。支付码错时抛 KEYSTORE_BAD_PASSCODE，与 v1 一致 */
export async function decryptKeystoreV2(keystore: Keystore, passcode: string, keyShare: Uint8Array): Promise<string> {
  assertKeystore(keystore);
  const { encPart } = await deriveKeystorePasscodeParts(keystore.crypto, passcode);
  try {
    return await decryptKeystoreV2WithParts(keystore, encPart, keyShare);
  } finally {
    encPart.fill(0);
  }
}
