/**
 * 进程内的 metadata 缓存。同一个 token 的 metadata 是不变量，而补全一次要走
 * Alchemy refresh + Arweave 网关，代价远高于 getNFTsForOwner 本身；没有缓存
 * 的话每次打开 /badges?tab=nfts 都会重跑一遍。
 *
 * 单进程、无淘汰上限之外的语义——够用即可，不值得引入 Redis。
 */
const POSITIVE_TTL_MS = 6 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 2000;

interface Entry<T> {
  value: T | null;
  expiresAt: number;
}

const store = new Map<string, Entry<unknown>>();

const keyOf = (chainId: number, contractAddress: string, tokenId: string) =>
  `${chainId}:${contractAddress.toLowerCase()}:${tokenId}`;

export function getCachedMetadata<T>(
  chainId: number,
  contractAddress: string,
  tokenId: string
): { hit: true; value: T | null } | { hit: false } {
  const key = keyOf(chainId, contractAddress, tokenId);
  const entry = store.get(key);
  if (!entry) return { hit: false };
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return { hit: false };
  }
  return { hit: true, value: entry.value as T | null };
}

export function setCachedMetadata<T>(
  chainId: number,
  contractAddress: string,
  tokenId: string,
  value: T | null
): void {
  if (store.size >= MAX_ENTRIES) {
    // 最老的插入顺序在前，删一批而不是逐条，避免每次写入都触发。
    for (const k of [...store.keys()].slice(0, Math.floor(MAX_ENTRIES / 4))) store.delete(k);
  }
  store.set(keyOf(chainId, contractAddress, tokenId), {
    value,
    expiresAt: Date.now() + (value ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS),
  });
}
