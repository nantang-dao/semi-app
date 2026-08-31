import { getBackendUrl } from "@/server/utils";

/**
 * 徽章数据的后端客户端。
 *
 * 数据已经从 InstantDB 搬到 Rails，但链上写入仍留在 Nitro —— 后端不持有私钥、
 * 不签名。所以这一层只搬运数据：id 由这边算好（namehash 需要 keccak），
 * Rails 负责存储和校验。
 *
 * 认证用的是服务间共享密钥，不是用户 token：用户的签名验证在 Nitro 侧
 * 完成，Rails 信任的是「请求来自 Nitro」。
 */
export class BadgeBackendError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "BadgeBackendError";
  }
}

function serviceToken(): string {
  const token = process.env.BADGE_SERVICE_TOKEN;
  if (!token) {
    // 宁可这里直接失败，也不要发一个没有凭证的请求出去然后拿 401 当业务错误报。
    throw new BadgeBackendError("BADGE_SERVICE_TOKEN is not configured", 500);
  }
  return token;
}

async function request<T>(method: "GET" | "POST", path: string, payload?: unknown): Promise<T> {
  const url = new URL(`${getBackendUrl()}/badge${path}`);
  const init: RequestInit = {
    method,
    headers: {
      "X-Service-Token": serviceToken(),
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
    },
  };

  if (method === "GET" && payload) {
    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
  } else if (payload) {
    init.body = JSON.stringify(payload);
  }

  const response = await fetch(url, init);
  const body = (await response.json().catch(() => null)) as
    (T & { result?: string; message?: string }) | null;

  if (!response.ok || body?.result !== "ok") {
    throw new BadgeBackendError(
      body?.message ?? `Badge backend failed (HTTP ${response.status})`,
      response.status
    );
  }
  return body as T;
}

export const badgeGet = <T>(path: string, query?: Record<string, unknown>) =>
  request<T>("GET", path, query);

export const badgePost = <T>(path: string, body?: unknown) => request<T>("POST", path, body);

export interface BadgeRow {
  id: string;
  badge_id: string;
  class_id: string;
  wallet_address: string;
  metadata: Record<string, string>;
  chain_id: number;
  tx_hash: string | null;
  status: string;
  created_at: string;
}

export interface BadgeClassRow {
  id: string;
  class_id: string;
  chain_id: number;
  profile_id: string;
  wallet_address: string;
  badge_contract_address: string;
  metadata: Record<string, string>;
  tx_hash: string | null;
  created_at: string;
}

export interface BadgeProfileRow {
  id: string;
  profile_id: string;
  wallet_address: string;
  chain_id: number;
  tx_hash: string | null;
  created_at: string;
}
