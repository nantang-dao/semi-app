/**
 * Alchemy 索引 API 的最小客户端。
 *
 * 我们只用到三个接口，都是无状态 HTTP。`alchemy-sdk` 为此要拖进 ethers v5
 * （11 个 @ethersproject 包）、@solana/web3.js、axios 和两个 websocket 库；
 * 而 utils/actions.ts 是静态 import，这些全都进了客户端 bundle。所以这里
 * 用 fetch 直接调，返回结构与 SDK 保持一致，调用方的字段映射不用改。
 *
 * 这是**索引/查询**，不是链上交互，所以留在 app 里而不是 semi-core——
 * semi-core 只做「发 RPC、算加密、编解码 calldata」那三件事。
 */
import { env } from "./env";

/** Alchemy 的主机名前缀，按链固定。与 utils/semi_core.ts 的映射同源。 */
const ALCHEMY_NETWORK: Record<number, string> = {
  1: "eth-mainnet",
  10: "opt-mainnet",
  11155111: "eth-sepolia",
};

/** 这条链是否有 Alchemy 索引服务。取代此前散在三个文件里的重复映射表。 */
export const isAlchemySupportedChain = (chainId: number): boolean => chainId in ALCHEMY_NETWORK;

export type AssetTransferCategory = "external" | "internal" | "erc20" | "erc721" | "erc1155";

export interface AssetTransfersParams {
  fromBlock?: string;
  toBlock?: string;
  fromAddress?: string;
  toAddress?: string;
  contractAddresses?: string[];
  category: AssetTransferCategory[];
  excludeZeroValue?: boolean;
  withMetadata?: boolean;
  maxCount?: number;
  /** SDK 的 SortingOrder.DESCENDING */
  order?: "asc" | "desc";
  pageKey?: string;
}

export interface AssetTransfersResponse {
  transfers: any[];
  pageKey?: string;
}

function baseUrl(chainId: number): string {
  const network = ALCHEMY_NETWORK[chainId];
  if (!network) throw new Error(`Unsupported chain ID: ${chainId}`);
  return `https://${network}.g.alchemy.com`;
}

function apiKeyOrThrow(explicit?: string): string {
  // 浏览器里没有 process.env，只能靠 Vite 在构建期把 import.meta.env 内联进来；
  // Nitro 服务端反过来只有 process.env。utils/env.ts 的 env() 同时覆盖两边。
  const key = explicit || env("VITE_ALCHEMY_API_KEY") || env("ALCHEMY_API_KEY");
  if (!key) throw new Error("VITE_ALCHEMY_API_KEY is missing");
  return key;
}

/**
 * SDK 会把 maxCount 这类数字转成 hex 再发；REST 接口两种都收，但为了和 SDK
 * 的请求逐字节一致（便于对拍），这里也转。
 */
const toHexCount = (n: number): string => `0x${n.toString(16)}`;

export async function getAssetTransfers(
  chainId: number,
  params: AssetTransfersParams,
  apiKey?: string
): Promise<AssetTransfersResponse> {
  const { maxCount, ...rest } = params;
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "alchemy_getAssetTransfers",
    params: [{ ...rest, ...(maxCount === undefined ? {} : { maxCount: toHexCount(maxCount) }) }],
  };

  const res = await fetch(`${baseUrl(chainId)}/v2/${apiKeyOrThrow(apiKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.error) {
    throw new Error(
      `alchemy_getAssetTransfers: ${json.error.message ?? JSON.stringify(json.error)}`
    );
  }
  return { transfers: json.result?.transfers ?? [], pageKey: json.result?.pageKey };
}

/**
 * NFT API 的 REST 响应会把缺失字段显式写成 `null`，而 alchemy-sdk 会把它们
 * 递归剔除。调用方写的是 `nft.description`、`nft.image?.originalUrl` 这类读法，
 * `null` 和缺失在取值上等价，但会序列化进我们自己的 API 响应里。这里跟随 SDK
 * 的行为，免得下游多出一批 null 字段。
 */
function stripNulls<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripNulls) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== null) out[k] = stripNulls(v);
    }
    return out as T;
  }
  return value;
}

async function nftApi(
  chainId: number,
  path: string,
  query: Record<string, string | undefined>,
  apiKey?: string
) {
  const url = new URL(`${baseUrl(chainId)}/nft/v3/${apiKeyOrThrow(apiKey)}/${path}`);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) url.searchParams.set(k, v);
  }
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return stripNulls(await res.json());
}

export interface NftsForOwnerResponse {
  ownedNfts: any[];
  pageKey?: string;
  totalCount?: number;
}

export async function getNftsForOwner(
  chainId: number,
  owner: string,
  opts: { pageSize?: number; pageKey?: string } = {},
  apiKey?: string
): Promise<NftsForOwnerResponse> {
  return nftApi(
    chainId,
    "getNFTsForOwner",
    {
      owner,
      withMetadata: "true",
      pageSize: String(opts.pageSize ?? 100),
      pageKey: opts.pageKey,
    },
    apiKey
  );
}

/**
 * 单个 NFT 的 metadata。`refreshCache=true` 会让 Alchemy 重新去抓 tokenURI 并
 * 回填自己的 CDN——这是让 Alchemy 代我们解析任意 tokenURI 的正路，服务端因此
 * 不必直连合约作者填的地址（见 server/utils/nft/resolveMetadataUri.ts）。
 * 注意 refresh 是异步的，返回的这一份未必已经填全。
 */
export async function getNftMetadata(
  chainId: number,
  contractAddress: string,
  tokenId: string,
  opts: { refreshCache?: boolean } = {},
  apiKey?: string
): Promise<any> {
  return nftApi(
    chainId,
    "getNFTMetadata",
    {
      contractAddress,
      tokenId,
      refreshCache: opts.refreshCache ? "true" : undefined,
    },
    apiKey
  );
}

export async function getOwnersForNft(
  chainId: number,
  contractAddress: string,
  tokenId: string,
  apiKey?: string
): Promise<{ owners: string[] }> {
  return nftApi(chainId, "getOwnersForNFT", { contractAddress, tokenId }, apiKey);
}
