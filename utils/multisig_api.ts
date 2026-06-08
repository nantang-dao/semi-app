/**
 * Multisig API client — matches MultisigController endpoints.
 * Follows the same pattern as semi_api.ts.
 */

import { getSemiRestBaseUrl, getAuthHeaders } from "./semi_api";
import type { UserOpSnapshot } from "./SafeSmartAccount/multisig";
import type { Address, Hex } from "viem";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MultisigWallet {
  id: string;
  name: string;
  wallet_type: string;
  chain_id: number;
  safe_address: Address;
  threshold: number;
  created_at: string;
}

export interface MultisigOwner {
  id: string;
  owner_address: Address;
  position: number;
  user_id: string | null;
  handle: string | null;
  phone?: string | null;
  image_url?: string | null;
}

export interface MultisigSignatureData {
  signer_address: Address;
  signature: Hex;
  signer_handle?: string;
  signer_phone?: string;
  signer_image_url?: string;
}

export interface MultisigTx {
  id: string;
  wallet_id: string;
  proposer_id: string;
  chain_id: number;
  queue_position: number | null;
  nonce: string | null;
  tx_type: string;
  call_detail: Record<string, any>;
  evm_call_data: string;
  threshold_at_creation: number;
  /** 当前钱包门限（权限判断以此为准，与链上一致） */
  current_threshold?: number;
  /** 当前钱包 owner 地址列表（小写） */
  current_owners?: string[];
  /** 仅统计当前 owner 的有效签名数 */
  eligible_signature_count?: number;
  replaces_tx_id: string | null;
  status: string;
  tx_hash: string | null;
  expires_at: string | null;
  signature_count: number;
  signer_addresses?: string[];
  /** 已存在的拒签竞争交易 ID（仅非 cancel 类型） */
  pending_reject_tx_id?: string | null;
  /** 公开备注（上链） */
  memo?: string | null;
  /** 发送者备注（不上链，仅发送方可见） */
  sender_note?: string | null;
  /** 执行者（"最后一个用户"）的用户 ID；gas 由 paymaster 代付，但成本记账给该用户 */
  executor_id?: string | null;
  /** 实际 gas 成本（wei），记账给 executor */
  gas_used?: string | null;
  created_at: string;
  updated_at: string;
  signatures?: MultisigSignatureData[];
  user_op_snapshot?: UserOpSnapshot;
  /** 终态交易的 owner 快照（含签名状态和发起人），活跃交易为 null */
  owner_snapshot?: OwnerSnapshot | null;
  /** 发起人信息（实时） */
  proposer?: ProposerInfo | null;
}

export interface OwnerSnapshot {
  owners: OwnerSnapshotEntry[];
  proposer: ProposerInfo;
}

export interface OwnerSnapshotEntry {
  address: string;
  name: string | null;
  signed: boolean;
  signed_at?: string | null;
}

export interface ProposerInfo {
  id: string;
  address: string | null;
  name: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export class MultisigApiError extends Error {
  code?: string;
  reject_tx_id?: string;

  constructor(
    message: string,
    opts?: { code?: string; reject_tx_id?: string }
  ) {
    super(message);
    this.name = "MultisigApiError";
    this.code = opts?.code;
    this.reject_tx_id = opts?.reject_tx_id;
  }
}

function base(): string {
  return getSemiRestBaseUrl();
}

async function handleRequest<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok || data.result === "error") {
    throw new MultisigApiError(data.message || data.error || "Request failed", {
      code: data.code,
      reject_tx_id: data.reject_tx_id,
    });
  }
  return data as T;
}

// ─── Wallet APIs ─────────────────────────────────────────────────────────────

/** Create a new multisig wallet on backend (after frontend predicts Safe address) */
export async function createMultisigWallet(params: {
  name: string;
  chain_id: number;
  owners: { address: string; user_id?: string }[];
  threshold: number;
  safe_address: string;
}): Promise<{ result: string; wallet: MultisigWallet }> {
  const resp = await fetch(`${base()}/create_multisig_wallet`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(params),
  });
  return handleRequest(resp);
}

/** Get all multisig wallets where current user is an owner */
export async function getMultisigWallets(): Promise<{ result: string; wallets: MultisigWallet[]; pending_signature_counts: Record<string, number> }> {
  const resp = await fetch(`${base()}/get_multisig_wallets`, {
    headers: getAuthHeaders(),
  });
  return handleRequest(resp);
}

/** Get owners of a specific multisig wallet */
export async function getMultisigWalletOwners(walletId: string): Promise<{
  result: string;
  owners: MultisigOwner[];
  threshold: number;
}> {
  const resp = await fetch(`${base()}/get_multisig_wallet_owners?wallet_id=${walletId}`, {
    headers: getAuthHeaders(),
  });
  return handleRequest(resp);
}

/** Sync wallet owners/threshold from on-chain data */
export async function syncMultisigWallet(params: {
  wallet_id: string;
  owners: string[];
  threshold: number;
}): Promise<{ result: string }> {
  const resp = await fetch(`${base()}/sync_multisig_wallet`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(params),
  });
  return handleRequest(resp);
}

// ─── Transaction APIs ─────────────────────────────────────────────────────────

/** Propose a new multisig transaction (transfer, add/remove owner, cancel, etc.) */
export async function proposeMultisigTx(params: {
  wallet_id: string;
  tx_type: string;
  call_detail: Record<string, any>;
  evm_call_data: string;
  replaces_tx_id?: string;
  user_op_snapshot?: UserOpSnapshot;
  memo?: string;
  sender_note?: string;
}): Promise<{ result: string; tx: MultisigTx }> {
  const resp = await fetch(`${base()}/propose_multisig_tx`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(params),
  });
  return handleRequest(resp);
}

/** Get transaction queue or history for a wallet */
export async function getMultisigTxs(
  walletId: string,
  scope: "queue" | "history" = "queue"
): Promise<{ result: string; txs: MultisigTx[] }> {
  const resp = await fetch(`${base()}/get_multisig_txs?wallet_id=${walletId}&scope=${scope}`, {
    headers: getAuthHeaders(),
  });
  return handleRequest(resp);
}

/** Get a single transaction by ID (includes signatures and user_op_snapshot) */
export async function getMultisigTx(id: string): Promise<{ result: string; tx: MultisigTx }> {
  const resp = await fetch(`${base()}/get_multisig_tx?id=${id}`, {
    headers: getAuthHeaders(),
  });
  return handleRequest(resp);
}

/**
 * Submit a signature for a multisig transaction.
 * First signer must also provide nonce and user_op_snapshot.
 */
export async function submitMultisigSignature(params: {
  multisig_tx_id: string;
  signer_address: string;
  signature: string;
  nonce?: string;
  user_op_snapshot?: UserOpSnapshot;
}): Promise<{ result: string; tx: MultisigTx }> {
  const resp = await fetch(`${base()}/submit_multisig_signature`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(params),
  });
  return handleRequest(resp);
}

/** Mark a tx as executing and get back snapshot + signatures for frontend execution */
export async function executeMultisigTx(
  multisig_tx_id: string
): Promise<{ result: string; tx: MultisigTx }> {
  const resp = await fetch(`${base()}/execute_multisig_tx`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ multisig_tx_id }),
  });
  return handleRequest(resp);
}

/** Confirm on-chain execution success */
export async function confirmMultisigTx(params: {
  multisig_tx_id: string;
  tx_hash: string;
  /** 实际 gas 成本（wei），来自 UserOp 回执的 actualGasCost；记账给执行者 */
  gas_used?: string;
}): Promise<{ result: string }> {
  const resp = await fetch(`${base()}/confirm_multisig_tx`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(params),
  });
  return handleRequest(resp);
}

/** Report execution failure */
export async function failMultisigTx(multisig_tx_id: string): Promise<{ result: string }> {
  const resp = await fetch(`${base()}/fail_multisig_tx`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ multisig_tx_id }),
  });
  return handleRequest(resp);
}

/** Reset a stuck executing transaction back to ready (owner only, after 5 min) */
export async function resetExecutingMultisigTx(multisig_tx_id: string): Promise<{ result: string }> {
  const resp = await fetch(`${base()}/reset_executing_multisig_tx`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ multisig_tx_id }),
  });
  return handleRequest(resp);
}

/** Withdraw a queued, unsigned transaction (proposer only) */
export async function withdrawMultisigTx(multisig_tx_id: string): Promise<{ result: string }> {
  const resp = await fetch(`${base()}/withdraw_multisig_tx`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ multisig_tx_id }),
  });
  return handleRequest(resp);
}

/** Look up memos for multisig transactions by on-chain tx_hash */
export async function lookupMultisigTxMemos(txHashes: string[]): Promise<{
  result: string;
  memos: Record<string, { memo: string | null; sender_note: string | null }>;
}> {
  const resp = await fetch(`${base()}/lookup_multisig_tx_memos?tx_hashes=${txHashes.join(",")}`, {
    headers: getAuthHeaders(),
  });
  return handleRequest(resp);
}
