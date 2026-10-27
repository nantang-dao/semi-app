import { bytesToHex, hexToBytes, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  KeystoreError,
  decryptKeystore,
  decryptKeystoreV2,
  decryptKeystoreV2WithParts,
  deriveKeystorePasscodeParts,
  encryptToKeystoreV2,
  secretToPrivateKey,
  type Keystore,
} from "semi-core/keys";
import { useUserStore } from "@/stores/user";
import { keystoreUpdateMessage } from "@/utils/keystore_message";
import { KeystoreUnlockError, getKeystore, unlockKeystore, updateKeystore, type UserInfo } from "@/utils/semi_api";

/**
 * 用支付码解开 keystore。所有要私钥的页面都走这里，不要再直接读 keystore。
 *
 * keystore v2（见 semi-backend docs/keystore.md）：解密还要服务端的 key_share，服务端核对支付码
 * 派生的 verifier 后才下发，连续错 50 次锁 24 小时。6 位支付码在 v1 下拿到 keystore 就能离线
 * 穷举，v2 把它变成在线猜测。
 *
 * - 打开或刷新页面后第一次输支付码：多一次 unlock_keystore 请求，拿到的 keystore 和 key_share
 *   只放在这个模块的变量里（不进 Pinia、localStorage、sessionStorage、IndexedDB）。
 * - 之后每次签名都在本地解，不联网。本地连续输错 3 次、闲置 15 分钟、退出登录时清掉缓存，
 *   下次回到服务端核对（计入失败次数）。
 * - v1 用户：照旧本地解开，顺手升级成 v2（失败不影响这次签名，下次再试）。
 * - 私钥和支付码都不缓存。
 */

const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const LOCAL_FAILURE_LIMIT = 3;

interface UnlockedKeystore {
  userId: string;
  keystore: Keystore;
  keyShare: Uint8Array;
  localFailures: number;
}

let unlocked: UnlockedKeystore | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
// 本次页面会话里升级失败过（比如手机时间不准，签名过期）就不再每次重试
let upgradeFailed = false;

/** 支付码错误次数过多，服务端已锁定 */
export class KeystoreLockedError extends Error {
  constructor(readonly lockedUntil: Date) {
    super(`支付码错误次数过多，请在 ${lockedUntil.toLocaleString()} 之后再试`);
  }
}

/** 清掉内存里的 keystore 和 key_share。退出登录、闲置超时时调用。 */
export function lockKeystore() {
  unlocked?.keyShare.fill(0);
  unlocked = null;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
}

function remember(entry: UnlockedKeystore) {
  lockKeystore();
  unlocked = entry;
  touch();
}

function touch() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(lockKeystore, IDLE_TIMEOUT_MS);
}

function parseKeystore(raw: unknown): Keystore {
  return (typeof raw === "string" ? JSON.parse(raw) : raw) as Keystore;
}

function isBadPasscode(error: unknown) {
  return error instanceof KeystoreError && error.code === "KEYSTORE_BAD_PASSCODE";
}

/** 解出 keystore 里的秘密串（助记词或裸私钥）。支付码错时抛 KeystoreError（KEYSTORE_BAD_PASSCODE）。 */
export async function unlockSecret(passcode: string): Promise<string> {
  const user = useUserStore().user;
  if (!user?.id) throw new Error("请先登录");
  if (unlocked && unlocked.userId !== user.id) lockKeystore();

  if (unlocked) {
    const entry = unlocked;
    try {
      const secret = await decryptKeystoreV2(entry.keystore, passcode, entry.keyShare);
      entry.localFailures = 0;
      touch();
      return secret;
    } catch (error) {
      if (isBadPasscode(error) && ++entry.localFailures >= LOCAL_FAILURE_LIMIT) lockKeystore();
      throw error;
    }
  }

  const info = await getKeystore();
  if (info.version === 1) {
    const secret = await decryptKeystore(parseKeystore(info.encrypted_keys), passcode);
    if (!upgradeFailed) {
      await upgradeToV2(user, secret, passcode).catch((error) => {
        upgradeFailed = true;
        console.warn("[keystore] upgrade to v2 failed, will retry next session", error);
      });
    }
    return secret;
  }
  if (info.version === 2) return unlockFromServer(user.id, info.params, passcode);
  throw new Error("该账户还没有设置支付码");
}

/** 解出私钥 */
export async function unlockPrivateKey(passcode: string): Promise<Hex> {
  return secretToPrivateKey(await unlockSecret(passcode));
}

async function unlockFromServer(
  userId: string,
  params: { salt: string; iterations: number },
  passcode: string
): Promise<string> {
  const { verifier, encPart } = await deriveKeystorePasscodeParts(params, passcode);
  try {
    let response: Awaited<ReturnType<typeof unlockKeystore>>;
    try {
      response = await unlockKeystore(verifier);
    } catch (error) {
      if (error instanceof KeystoreUnlockError && error.code === "bad_passcode") {
        // 文案里保留 "decrypt"：多签页面按这个词判断是不是支付码错
        throw new KeystoreError(
          "KEYSTORE_BAD_PASSCODE",
          `Failed to decrypt keystore — wrong passcode (${error.data.attempts_left ?? 0} attempts left)`,
          { cause: error }
        );
      }
      if (error instanceof KeystoreUnlockError && error.code === "keystore_locked" && error.data.locked_until) {
        throw new KeystoreLockedError(new Date(error.data.locked_until));
      }
      throw error;
    }
    const keystore = parseKeystore(response.encrypted_keys);
    const keyShare = hexToBytes(`0x${response.key_share}`);
    const secret = await decryptKeystoreV2WithParts(keystore, encPart, keyShare);
    remember({ userId, keystore, keyShare, localFailures: 0 });
    return secret;
  } finally {
    encPart.fill(0);
  }
}

/** 新建或导入钱包时生成 v2 keystore，字段直接放进 setEncryptedKeys */
export async function createKeystoreV2(secret: string, passcode: string) {
  const { keystore, verifier, keyShare } = await encryptToKeystoreV2(secret, passcode);
  const encrypted_keys = JSON.stringify(keystore);
  const key_share = bytesToHex(keyShare).slice(2);
  keyShare.fill(0);
  return { encrypted_keys, verifier, key_share };
}

/**
 * v1 → v2：同一个秘密串、同一个支付码，换成需要 key_share 的格式。用已绑定的私钥签名，
 * 服务端据此确认还是同一把私钥。上传前先本地解一遍，确认新 keystore 能解开。
 */
async function upgradeToV2(user: UserInfo, secret: string, passcode: string) {
  const account = privateKeyToAccount(secretToPrivateKey(secret));
  // 绑定的私钥和 keystore 里的对不上就不动它（升级的签名本来也过不了服务端）
  if (account.address.toLowerCase() !== user.evm_chain_active_key?.toLowerCase()) return;

  const { keystore, verifier, keyShare } = await encryptToKeystoreV2(secret, passcode);
  if ((await decryptKeystoreV2(keystore, passcode, keyShare)) !== secret) {
    throw new Error("re-encrypted keystore does not round-trip");
  }

  const encrypted_keys = JSON.stringify(keystore);
  const key_share = bytesToHex(keyShare).slice(2);
  const issued_at = Math.floor(Date.now() / 1000);
  const signature = await account.signMessage({
    message: keystoreUpdateMessage(user.id, issued_at, encrypted_keys, verifier, key_share),
  });
  await updateKeystore({ encrypted_keys, verifier, key_share, issued_at, public_key: account.publicKey, signature });
  remember({ userId: user.id, keystore, keyShare, localFailures: 0 });
}
