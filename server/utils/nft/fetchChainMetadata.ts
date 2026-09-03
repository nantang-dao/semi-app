import { getNftMetadata } from "@/utils/alchemy";
import {
  normalizeAttributes,
  parseChainMetadataJson,
  type ChainMetadataJson,
} from "./metadataHelpers";
import { isMetadataIncomplete, type AlchemyOwnedNftLike } from "./isMetadataIncomplete";
import { resolveMetadataMediaUrl, resolveMetadataUriCandidates } from "./resolveMetadataUri";

const METADATA_FETCH_TIMEOUT_MS = 8_000;
/** 网关返回的 JSON 上限，防止一个超大 body 把 Nitro 拖垮。 */
const MAX_METADATA_BYTES = 512 * 1024;

export interface FetchedChainMetadata {
  name?: string;
  description?: string;
  image?: string;
  externalUrl?: string;
  attributes?: Record<string, unknown>;
  rawJson: ChainMetadataJson;
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: "application/json" },
      redirect: "error", // 重定向能把白名单主机绕过去
    });
    if (!res.ok) return null;

    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > MAX_METADATA_BYTES) return null;
    const text = await res.text();
    if (text.length > MAX_METADATA_BYTES) return null;
    return JSON.parse(text);
  } catch (err) {
    console.warn(`[nft-metadata] fetch failed for ${url}:`, err);
    return null;
  }
}

/** Race gateways — first successful JSON wins (Arweave CDNs are flaky). */
async function fetchJsonFromUri(tokenUri: string): Promise<unknown | null> {
  const candidates = resolveMetadataUriCandidates(tokenUri);
  if (candidates.length === 0) return null;

  return Promise.any(
    candidates.map(async (url) => {
      const json = await fetchJson(url, METADATA_FETCH_TIMEOUT_MS);
      if (!json) throw new Error(`no json from ${url}`);
      return json;
    })
  ).catch(() => null);
}

function toFetched(json: unknown): FetchedChainMetadata | null {
  const parsed = parseChainMetadataJson(json);
  if (!parsed) return null;

  const externalRaw = typeof parsed.external_url === "string" ? parsed.external_url.trim() : "";
  return {
    name: typeof parsed.name === "string" ? parsed.name : undefined,
    description: typeof parsed.description === "string" ? parsed.description : undefined,
    image: resolveMetadataMediaUrl(parsed.image),
    externalUrl:
      externalRaw.startsWith("https://") || externalRaw.startsWith("http://")
        ? externalRaw
        : undefined,
    attributes: normalizeAttributes(parsed),
    rawJson: parsed,
  };
}

function fromAlchemyNft(nft: AlchemyOwnedNftLike & { description?: string | null }) {
  const raw = nft.raw?.metadata ?? {};
  return toFetched({
    name: nft.name ?? (raw as Record<string, unknown>).name,
    description: nft.description ?? (raw as Record<string, unknown>).description,
    image:
      nft.image?.originalUrl ||
      nft.image?.cachedUrl ||
      nft.image?.pngUrl ||
      (raw as Record<string, unknown>).image,
    external_url: (raw as Record<string, unknown>).external_url,
    attributes: (raw as Record<string, unknown>).attributes,
  });
}

/**
 * 补全一个 NFT 的 metadata，按代价从小到大：
 *
 *   1. 让 Alchemy 带 refreshCache 重抓一次——由 Alchemy 去解析任意 tokenURI，
 *      成功的话我们连网关都不用碰，还顺带拿到它 CDN 上的图。
 *   2. Alchemy 仍然没抓到（ar:// 它经常抓不动）时，才自己去抓 tokenURI，
 *      且 URL 必须落在网关白名单内。tokenURI 直接取 Alchemy 响应里的
 *      `raw.tokenUri`，不再自己发一次 eth_call。
 */
export async function fetchChainMetadata(
  chainId: number,
  contractAddress: string,
  tokenId: string,
  fallbackTokenUri?: string
): Promise<FetchedChainMetadata | null> {
  let refreshed: (AlchemyOwnedNftLike & { raw?: { tokenUri?: string | null } }) | null = null;
  try {
    refreshed = await getNftMetadata(chainId, contractAddress, tokenId, { refreshCache: true });
  } catch (err) {
    console.warn(`[nft-metadata] refresh failed for ${contractAddress}#${tokenId}:`, err);
  }

  if (refreshed && !isMetadataIncomplete(refreshed)) {
    return fromAlchemyNft(refreshed);
  }

  const tokenUri = refreshed?.raw?.tokenUri?.trim() || fallbackTokenUri?.trim();
  if (!tokenUri) return refreshed ? fromAlchemyNft(refreshed) : null;

  const json = await fetchJsonFromUri(tokenUri);
  if (!json) return refreshed ? fromAlchemyNft(refreshed) : null;
  return toFetched(json);
}
