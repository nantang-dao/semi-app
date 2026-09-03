/**
 * tokenURI 由合约作者任意填写，而解析这个 URI 的 fetch 发生在 Nitro 服务端。
 * 如果照单全收，任何人空投一个 tokenURI 指向 http://169.254.169.254/ 的 NFT
 * 就能把 /api/nft/owned 变成内网探针。所以这里只放行已知的去中心化网关主机，
 * 其余一律不解析——白名单外的 metadata 交给 Alchemy 去抓（见 fetchChainMetadata）。
 */
const ARWEAVE_GATEWAYS = [
  "https://arweave.net",
  "https://ar-io.dev",
  "https://ario.permagate.io",
] as const;

const IPFS_GATEWAYS = ["https://ipfs.io"] as const;

/** 允许服务端直连的主机。与上面两张网关表同源。 */
const ALLOWED_HOSTS = new Set(
  [...ARWEAVE_GATEWAYS, ...IPFS_GATEWAYS].map((gw) => new URL(gw).hostname)
);

export function isAllowedMetadataUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && ALLOWED_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export function resolveMetadataUriCandidates(uri: string): string[] {
  const trimmed = uri.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("ar://")) {
    const txId = trimmed.slice("ar://".length).trim();
    if (!txId || txId.includes("://")) return [];
    return ARWEAVE_GATEWAYS.map((gw) => `${gw}/${txId}`);
  }

  if (trimmed.startsWith("ipfs://")) {
    const path = trimmed
      .slice("ipfs://".length)
      .replace(/^ipfs\//, "")
      .trim();
    if (!path || path.includes("://")) return [];
    return IPFS_GATEWAYS.map((gw) => `${gw}/ipfs/${path}`);
  }

  // 已经是 https 的，只有落在网关白名单里才自己抓。
  return isAllowedMetadataUrl(trimmed) ? [trimmed] : [];
}

/** Resolve ar://, ipfs://, or gateway https metadata URIs to a fetchable HTTPS URL. */
export function resolveMetadataUri(uri: string): string | undefined {
  return resolveMetadataUriCandidates(uri)[0];
}

/**
 * image 等媒体字段。这里的产物只会进 <img src>，由浏览器直连，不经过服务端，
 * 所以不适用上面的主机白名单，只需要拦掉 javascript: 这类协议。
 */
export function resolveMetadataMediaUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const resolved = resolveMetadataUriCandidates(trimmed)[0];
  if (resolved) return resolved;
  if (trimmed.startsWith("ar://") || trimmed.startsWith("ipfs://")) return undefined;
  return trimmed.startsWith("https://") || trimmed.startsWith("http://") ? trimmed : undefined;
}
