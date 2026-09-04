import { sha256 } from "viem/utils";
import type { TransactionReceipt } from "./SafeSmartAccount/operation";

// API 响应的基础接口
interface BaseResponse {
  result?: "ok";
  error?: string;
}

// 用户信息接口
export interface UserInfo {
  id: string;
  handle: string | null;
  email: string | null;
  phone: string;
  image_url: string | null;
  evm_chain_address?: string | null;
  evm_chain_active_key?: string | null;
  remaining_gas_credits?: number;
  total_used_gas_credits?: number;
  encrypted_keys?: string | null;
  handle_changed_at?: string | null;
  next_rename_at?: string | null;
  renamed_from?: string | null;
}

// 登录响应接口
interface SignInResponse extends BaseResponse {
  auth_token: string;
  phone: string;
  id: string;
  address_type: "phone";
}

// 加密密钥响应接口
interface EncryptedKeysResponse extends BaseResponse {
  encrypted_keys: string;
}

// 剩余免手续费交易次数响应接口
interface RemainingGasCreditsResponse extends BaseResponse {
  remaining_free_transactions: number;
}

// Semi Rails REST base URL: reads from runtimeConfig.public.apiUrl (set via VITE_API_URL env var)
function normalizeSemiRestBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function getSemiRestBaseUrl(): string {
  try {
    const config = useRuntimeConfig();
    const u = config.public.apiUrl;
    if (typeof u === "string" && u.trim()) {
      return normalizeSemiRestBaseUrl(u);
    }
  } catch {
    // no Nuxt context, fall through to import.meta
  }
  const v = import.meta.env.VITE_API_URL;
  if (typeof v === "string" && v.trim()) {
    return normalizeSemiRestBaseUrl(v);
  }
  return "https://api.semi.im";
}

function requireSemiRestBaseUrl(): string {
  return getSemiRestBaseUrl();
}

// Legacy alias kept for any direct references outside the file
export const API_BASE_URL = "https://api.semi.im";
export const AUTH_TOKEN_KEY = "semi_auth_token";

const MOCK_RESPONSE = false;

// 通用请求处理函数
async function handleRequest<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || error.message || "请求失败");
  }
  return response.json();
}

// 获取认证头
export function getAuthHeaders(): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  const authToken = getCookie(AUTH_TOKEN_KEY);
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }
  return headers;
}

// 设置认证令牌
export function setAuthToken(token: string) {
  setCookie(AUTH_TOKEN_KEY, token, 365); // 设置365天过期
}

// 清除认证令牌
export function clearAuthToken() {
  deleteCookie(AUTH_TOKEN_KEY);
}

// Cookie 操作辅助函数
export function setCookie(name: string, value: string, days: number) {
  const date = new Date();
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
  const expires = `expires=${date.toUTCString()}`;
  document.cookie = `${name}=${value};${expires};path=/`;
}

export function getCookie(name: string): string | null {
  const nameEQ = `${name}=`;
  const ca = document.cookie.split(";");
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === " ") c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}

export function deleteCookie(name: string) {
  setCookie(name, "", -1);
}

/**
 * 登出。
 *
 * 先让服务端吊销这个 token，再删本地 cookie。**顺序不能反** —— cookie 一删
 * 就拼不出 Authorization 头，服务端也就不知道该吊销哪一个。
 *
 * 服务端调用失败不阻断登出：用户点了退出，本地状态就必须清掉。代价是那个
 * token 在服务端仍然有效直到过期，所以失败要记日志，别静默吞掉。
 *
 * 只吊销当前这一个 token，其他设备的登录状态不受影响。
 */
export async function logout(): Promise<void> {
  try {
    const resp = await fetch(`${requireSemiRestBaseUrl()}/logout`, {
      method: "POST",
      headers: getAuthHeaders(),
    });
    // fetch 只在网络层失败时 reject —— 401 / 500 都会正常 resolve。
    // 不看 resp.ok 的话「吊销失败」就被静默吞掉了，正是上面注释说不该发生的事。
    if (!resp.ok) {
      console.error(`[logout] 服务端吊销失败（HTTP ${resp.status}），该 token 将保持有效至过期`);
    }
  } catch (error) {
    console.error("[logout] 服务端吊销失败（网络错误），该 token 将保持有效至过期", error);
  } finally {
    clearAuthToken();
  }
}

// 1. 获取欢迎信息
export async function getHello(): Promise<{ message: string }> {
  const response = await fetch(`${requireSemiRestBaseUrl()}/`);
  return handleRequest<{ message: string }>(response);
}

// 2. 发送短信验证码
export async function sendSMS(phone: string): Promise<BaseResponse> {
  // mock
  if (MOCK_RESPONSE) {
    return {
      result: "ok",
      message: "验证码已发送",
    } as BaseResponse;
  }

  const response = await fetch(`${requireSemiRestBaseUrl()}/send_sms`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ phone }),
  });
  return handleRequest<BaseResponse>(response);
}

// 3. 使用手机号和验证码登录
export async function signIn(phone: string, code: string): Promise<SignInResponse> {
  // mock
  const moc_response = {
    result: "ok",
    auth_token: "1234567890",
    phone: phone,
    id: "1234567890",
    address_type: "phone",
  } as SignInResponse;

  if (MOCK_RESPONSE) {
    setAuthToken("1234567890");
    return moc_response;
  }

  const response = await fetch(`${requireSemiRestBaseUrl()}/signin`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ phone, code }),
  });
  const data = await handleRequest<SignInResponse>(response);
  if (data.auth_token) {
    setAuthToken(data.auth_token);
  }
  return data;
}

// 4. 设置用户句柄
export async function setHandle(id: string, handle: string): Promise<BaseResponse> {
  const response = await fetch(`${requireSemiRestBaseUrl()}/set_handle`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ id, handle }),
  });
  return handleRequest<BaseResponse>(response);
}

// 5. 设置用户头像 URL
export async function setImageUrl(id: string, image_url: string): Promise<BaseResponse> {
  const response = await fetch(`${requireSemiRestBaseUrl()}/set_image_url`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ id, image_url }),
  });
  return handleRequest<BaseResponse>(response);
}

// 6. 设置加密密钥

export interface SetEncryptedKeysProps {
  id: string;
  encrypted_keys: string;
  evm_chain_address: string;
  evm_chain_active_key: string;
}

export async function setEncryptedKeys(props: SetEncryptedKeysProps): Promise<BaseResponse> {
  const response = await fetch(`${requireSemiRestBaseUrl()}/set_encrypted_keys`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(props),
  });
  return handleRequest<BaseResponse>(response);
}

// 7. 获取加密密钥
export async function getEncryptedKeys(id: string): Promise<EncryptedKeysResponse> {
  const response = await fetch(`${requireSemiRestBaseUrl()}/get_encrypted_keys?id=${id}`, {
    headers: getAuthHeaders(),
  });
  return handleRequest<EncryptedKeysResponse>(response);
}

// 8. 获取用户信息
export async function getUser(id: string): Promise<UserInfo> {
  // mock
  const moc_response = {
    id: "1234567890",
    handle: "test",
    email: "test@test.com",
    phone: "1234567890",
    image_url: "https://test.com/test.jpg",
  } as UserInfo;

  if (MOCK_RESPONSE) {
    return moc_response;
  }

  const response = await fetch(`${requireSemiRestBaseUrl()}/get_user?id=${id}`, {
    headers: getAuthHeaders(),
  });
  return handleRequest<UserInfo>(response);
}

export async function getMe(): Promise<UserInfo> {
  const response = await fetch(`${requireSemiRestBaseUrl()}/get_me`, {
    headers: getAuthHeaders(),
  });
  return handleRequest<UserInfo>(response);
}

// 9. 设置EVM链地址
export async function setEvmChainAddress(
  id: string,
  evm_chain_address: string,
  evm_chain_active_key: string
): Promise<BaseResponse> {
  const response = await fetch(`${requireSemiRestBaseUrl()}/set_evm_chain_address`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ id, evm_chain_address, evm_chain_active_key }),
  });
  return handleRequest<BaseResponse>(response);
}

export async function signinWithPassword(phone: string, password: string) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(password);
  const hax = sha256(bytes);
  console.log("password_hash", hax);

  const response = await fetch(`${requireSemiRestBaseUrl()}/signin_with_password`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ phone, password: hax }),
  });

  const data = await handleRequest<SignInResponse>(response);

  if (data.auth_token) {
    setAuthToken(data.auth_token);
  }

  return data;
}

// 查询剩余免手续费交易次数
export async function getRemainingGasCredits(): Promise<RemainingGasCreditsResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${requireSemiRestBaseUrl()}/remaining_free_transactions`, {
      signal: controller.signal,
      headers: getAuthHeaders(),
    });
    return handleRequest<RemainingGasCreditsResponse>(response);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        "Request timed out: " + `${requireSemiRestBaseUrl()}/remaining_free_transactions`
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export interface TransactionRecord {
  id?: number;
  tx_hash: string;
  gas_used: string;
  status: string;
  chain: string;
  chain_id?: number;
  data: string; // TransactionReceipt 的 JSON 字符串
  memo: string;
  sender_note?: string;
  receiver_note?: string;
  sender_address?: string;
  receiver_address?: string;
  sender_handle?: string | null;
  receiver_handle?: string | null;
  metadata?: string;
}

// 上传交易记录
export async function uploadTransaction(transaction: TransactionRecord): Promise<BaseResponse> {
  const response = await fetch(`${requireSemiRestBaseUrl()}/add_transaction`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(transaction),
  });
  return handleRequest<BaseResponse>(response);
}

// 设置交易备注
export async function setTransactionNote(props: {
  id: number;
  sender_note?: string;
  receiver_note?: string;
}): Promise<BaseResponse> {
  const response = await fetch(`${requireSemiRestBaseUrl()}/set_transaction_note`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(props),
  });
  return handleRequest<BaseResponse>(response);
}

// 获取交易记录
export interface TransactionRecordResponse extends BaseResponse {
  transactions: TransactionRecord[];
}

export async function getTransactions(
  txhashes?: string,
  chainId?: number
): Promise<TransactionRecordResponse> {
  const params = new URLSearchParams();
  if (txhashes) params.set("txhashes", txhashes);
  if (chainId !== undefined) params.set("chain_id", String(chainId));
  const query = params.toString();
  const response = await fetch(
    `${requireSemiRestBaseUrl()}/get_transactions${query ? `?${query}` : ""}`,
    {
      headers: getAuthHeaders(),
    }
  );

  return handleRequest<TransactionRecordResponse>(response);
}

export async function getUserByHandle(handle: string): Promise<UserInfo> {
  const response = await fetch(`${requireSemiRestBaseUrl()}/get_by_handle?handle=${handle}`, {
    headers: getAuthHeaders(),
  });
  return handleRequest<UserInfo>(response);
}

export async function getUserByHandleOrPhone(handleOrPhone: string): Promise<UserInfo | null> {
  const response = await fetch(
    `${requireSemiRestBaseUrl()}/get_by_handle?handle=${handleOrPhone}`,
    {
      headers: getAuthHeaders(),
    }
  );

  try {
    return await handleRequest<UserInfo | null>(response);
  } catch (error) {
    return null;
  }
}

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * 上传图片，返回图床 URL。
 *
 * 文件交给 Semi 后端 `/upload_image`，由后端拿服务端保管的凭证转发到图床。
 * 之前是浏览器直传 api.sola.day，且把上游 token 打进了客户端 bundle。
 */
export async function uploadFile(file: Blob): Promise<string> {
  const extension = IMAGE_EXTENSIONS[file.type] ?? "bin";
  const formData = new FormData();
  formData.append("file", file, `upload.${extension}`);

  // 不能复用 getAuthHeaders()：它会设 Content-Type: application/json，
  // 那样 multipart 的 boundary 就丢了。
  const headers: Record<string, string> = {};
  const authToken = getCookie(AUTH_TOKEN_KEY);
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const response = await fetch(`${requireSemiRestBaseUrl()}/upload_image`, {
    method: "POST",
    headers,
    body: formData,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.url) {
    throw new Error(data?.message ?? `Upload failed (HTTP ${response.status})`);
  }
  return data.url as string;
}

export interface TokenClass {
  token_type: string;
  chain_id: number;
  chain: string;
  address: string;
  name: string;
  symbol: string;
  image_url: string;
  publisher_address: string;
  position: number;
  description: string;
  decimals: number;
}

export async function addTokenClass(props: TokenClass): Promise<void> {
  const response = await fetch(`${requireSemiRestBaseUrl()}/add_token_class`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(props),
  });

  await handleRequest<BaseResponse>(response);
}

export interface TokenClassResponse extends BaseResponse {
  token_classes: TokenClass[];
}

export async function getTokenClass(): Promise<TokenClassResponse> {
  const response = await fetch(`${requireSemiRestBaseUrl()}/get_token_classes`, {
    headers: getAuthHeaders(),
  });

  return handleRequest<TokenClassResponse>(response);
}

// 上传交易记录
export async function uploadTransactionWithGasCredits(
  transaction: TransactionRecord
): Promise<BaseResponse> {
  const response = await fetch(`${requireSemiRestBaseUrl()}/add_transaction_with_gas_credits`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(transaction),
  });
  return handleRequest<BaseResponse>(response);
}

// 发送邮箱验证码
export async function sendEmailCode(email: string): Promise<BaseResponse> {
  const response = await fetch(`${requireSemiRestBaseUrl()}/send_email`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ email }),
  });
  return handleRequest<BaseResponse>(response);
}

// 登录响应接口
interface SignInWithEmailResponse extends BaseResponse {
  auth_token: string;
  email: string;
  id: string;
  address_type: "email";
}

// 使用手机号和验证码登录
export async function signInWithEmail(
  email: string,
  code: string
): Promise<SignInWithEmailResponse> {
  // mock
  const moc_response = {
    result: "ok",
    auth_token: "1234567890",
    email: email,
    id: "1234567890",
    address_type: "email",
  } as SignInWithEmailResponse;

  if (MOCK_RESPONSE) {
    setAuthToken("1234567890");
    return moc_response;
  }

  const response = await fetch(`${requireSemiRestBaseUrl()}/signin_with_email`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ email, code }),
  });

  const data = await handleRequest<SignInWithEmailResponse>(response);
  if (data.auth_token) {
    setAuthToken(data.auth_token);
  }
  return data;
}

// 联系人接口
export interface Contact {
  memo: string;
  address: string;
  chain: string;
}

// 设置联系人列表
export async function setContacts(id: string, contact_list: Contact[]): Promise<BaseResponse> {
  const response = await fetch(`${requireSemiRestBaseUrl()}/set_contacts`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ id, contact_list }),
  });
  return handleRequest<BaseResponse>(response);
}

// 获取联系人列表响应接口
interface GetContactsResponse extends BaseResponse {
  contacts: Contact[];
}

// 获取联系人列表
export async function getContacts(id: string): Promise<GetContactsResponse> {
  const response = await fetch(`${requireSemiRestBaseUrl()}/get_contacts?id=${id}`, {
    headers: getAuthHeaders(),
  });
  return handleRequest<GetContactsResponse>(response);
}
