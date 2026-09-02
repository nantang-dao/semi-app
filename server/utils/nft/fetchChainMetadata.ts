import type { Address, Chain } from "viem";
import { chainContext } from "~/utils/semi_core";
import {
  normalizeAttributes,
  parseChainMetadataJson,
  type ChainMetadataJson,
} from "./metadataHelpers";
import { resolveMetadataMediaUrl, resolveMetadataUriCandidates } from "./resolveMetadataUri";

const ERC721_TOKEN_URI_ABI = [
  {
    name: "tokenURI",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

const METADATA_FETCH_TIMEOUT_MS = 20_000;

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
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn(`[fetchChainMetadata] fetch failed for ${url}:`, err);
    return null;
  }
}

/** Race gateways — first successful JSON wins (Arweave CDNs are flaky). */
async function fetchJsonFromUri(tokenUri: string): Promise<unknown | null> {
  const candidates = resolveMetadataUriCandidates(tokenUri);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) {
    return fetchJson(candidates[0]!, METADATA_FETCH_TIMEOUT_MS);
  }

  const perGateway = Math.max(
    8_000,
    Math.floor(METADATA_FETCH_TIMEOUT_MS / candidates.length) + 4_000
  );
  const result = await Promise.any(
    candidates.map(async (url) => {
      const json = await fetchJson(url, perGateway);
      if (!json) throw new Error(`no json from ${url}`);
      return json;
    })
  ).catch(() => null);

  return result;
}

function parseTokenId(tokenId: string): bigint | null {
  try {
    if (tokenId.startsWith("0x")) return BigInt(tokenId);
    return BigInt(tokenId);
  } catch {
    return null;
  }
}

export async function fetchChainMetadata(
  chain: Chain,
  contractAddress: string,
  tokenId: string
): Promise<FetchedChainMetadata | null> {
  let client;
  try {
    client = chainContext(chain.id).publicClient;
  } catch (err) {
    console.warn(`[fetchChainMetadata] no chain context for ${chain.id}:`, err);
    return null;
  }

  const id = parseTokenId(tokenId);
  if (id === null) return null;

  try {
    const tokenUri = await client.readContract({
      address: contractAddress as Address,
      abi: ERC721_TOKEN_URI_ABI,
      functionName: "tokenURI",
      args: [id],
    });

    if (typeof tokenUri !== "string" || !tokenUri.trim()) return null;

    const json = await fetchJsonFromUri(tokenUri);
    const parsed = parseChainMetadataJson(json);
    if (!parsed) return null;

    const image = resolveMetadataMediaUrl(parsed.image);
    const externalRaw = typeof parsed.external_url === "string" ? parsed.external_url.trim() : "";
    const externalUrl =
      externalRaw.startsWith("http://") || externalRaw.startsWith("https://")
        ? externalRaw
        : undefined;

    return {
      name: typeof parsed.name === "string" ? parsed.name : undefined,
      description: typeof parsed.description === "string" ? parsed.description : undefined,
      image,
      externalUrl,
      attributes: normalizeAttributes(parsed),
      rawJson: parsed,
    };
  } catch (err) {
    console.warn(`[fetchChainMetadata] tokenURI failed for ${contractAddress}#${tokenId}:`, err);
    return null;
  }
}
