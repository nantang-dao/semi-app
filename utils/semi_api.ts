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

// API 基础配置
export const API_BASE_URL = "https://semi.fly.dev";
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
function getAuthHeaders(): HeadersInit {
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

// 登出方法
export function logout(): void {
  clearAuthToken();
}

// 1. 获取欢迎信息
export async function getHello(): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}/`);
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

  const response = await fetch(`${API_BASE_URL}/send_sms`, {
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

  const response = await fetch(`${API_BASE_URL}/signin`, {
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
  const response = await fetch(`${API_BASE_URL}/set_handle`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ id, handle }),
  });
  return handleRequest<BaseResponse>(response);
}

// 5. 设置用户头像 URL
export async function setImageUrl(id: string, image_url: string): Promise<BaseResponse> {
  const response = await fetch(`${API_BASE_URL}/set_image_url`, {
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
  const response = await fetch(`${API_BASE_URL}/set_encrypted_keys`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(props),
  });
  return handleRequest<BaseResponse>(response);
}

// 7. 获取加密密钥
export async function getEncryptedKeys(id: string): Promise<EncryptedKeysResponse> {
  const response = await fetch(`${API_BASE_URL}/get_encrypted_keys?id=${id}`, {
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

  const response = await fetch(`${API_BASE_URL}/get_user?id=${id}`, {
    headers: getAuthHeaders(),
  });
  return handleRequest<UserInfo>(response);
}

export async function getMe(): Promise<UserInfo> {
  const response = await fetch(`${API_BASE_URL}/get_me`, {
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
  const response = await fetch(`${API_BASE_URL}/set_evm_chain_address`, {
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

  const response = await fetch(`${API_BASE_URL}/signin_with_password`, {
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
    const response = await fetch(`${API_BASE_URL}/remaining_free_transactions`, {
      signal: controller.signal,
      headers: getAuthHeaders(),
    });
    return handleRequest<RemainingGasCreditsResponse>(response);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Request timed out: " + `${API_BASE_URL}/remaining_free_transactions`);
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
  data: string; // TransactionReceipt 的 JSON 字符串
  memo: string;
  sender_note?: string;
  receiver_note?: string;
  sender_address?: string;
  receiver_address?: string;
}

// 上传交易记录
export async function uploadTransaction(transaction: TransactionRecord): Promise<BaseResponse> {
  const response = await fetch(`${API_BASE_URL}/add_transaction`, {
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
  const response = await fetch(`${API_BASE_URL}/set_transaction_note`, {
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

export async function getTransactions(txhashes?: string): Promise<TransactionRecordResponse> {
  const response = await fetch(
    `${API_BASE_URL}/get_transactions${txhashes ? `?tx_hashes=${txhashes}` : ""}`,
    {
      headers: getAuthHeaders(),
    }
  );

  return handleRequest<TransactionRecordResponse>(response);
}

export async function getUserByHandle(handle: string): Promise<UserInfo> {
  const response = await fetch(`${API_BASE_URL}/get_by_handle?handle=${handle}`, {
    headers: getAuthHeaders(),
  });
  return handleRequest<UserInfo>(response);
}

export async function getUserByHandleOrPhone(handleOrPhone: string): Promise<UserInfo | null> {
  const response = await fetch(`${API_BASE_URL}/get_by_handle?handle=${handleOrPhone}`, {
    headers: getAuthHeaders(),
  });

  try {
    return await handleRequest<UserInfo | null>(response);
  } catch (error) {
    return null;
  }
}

export async function uploadFile(file: Blob, authToken: string): Promise<string> {
  const formData = new FormData();
  formData.append("auth_token", authToken);
  formData.append("uploader", "user");
  formData.append("resource", Math.random().toString(36).slice(-8));
  formData.append("data", file);

  const response = await fetch("https://api.sola.day/service/upload_image", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Upload failed");
  }

  const data = await response.json();
  return data.result.url as string;
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
  const response = await fetch(`${API_BASE_URL}/add_token_class`, {
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
  const response = await fetch(`${API_BASE_URL}/get_token_classes`, {
    headers: getAuthHeaders(),
  });

  return handleRequest<TokenClassResponse>(response);
}

// 上传交易记录
export async function uploadTransactionWithGasCredits(
  transaction: TransactionRecord
): Promise<BaseResponse> {
  const response = await fetch(`${API_BASE_URL}/add_transaction_with_gas_credits`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(transaction),
  });
  return handleRequest<BaseResponse>(response);
}

// 发送邮箱验证码
export async function sendEmailCode(email: string): Promise<BaseResponse> {
  const response = await fetch(`${API_BASE_URL}/send_email`, {
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

  const response = await fetch(`${API_BASE_URL}/signin_with_email`, {
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
export async function setContacts(
  id: string,
  contact_list: Contact[]
): Promise<BaseResponse> {
  const response = await fetch(`${API_BASE_URL}/set_contacts`, {
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
  const response = await fetch(`${API_BASE_URL}/get_contacts?id=${id}`, {
    headers: getAuthHeaders(),
  });
  return handleRequest<GetContactsResponse>(response);
}
