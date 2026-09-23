/**
 * 多签的多链协调。
 *
 * 同一个 Safe 地址在每条链上是后端的一行 wallet，owner / 门限 / 队列 / nonce
 * 都按链独立。约定：**每一行的 owner 就是 Safe 在那条链上的有效 owner**——
 * 已部署的链是链上状态，未部署的链是初始配置（第一笔 UserOp 用它生成
 * initCode）。所以建快照、签名、执行都只需要看这一行，semi-core 不用改。
 *
 * owner 变更要一次发到所有链：各链各一笔交易，calldata 按该链的 owner 链表
 * 分别编码，后端用 group_id 关联。见 semi-backend/docs/multisig.md。
 */
import type { Address, Hex } from "viem";
import { SENTINEL_OWNERS } from "semi-core/chains";
import { isDeployed } from "semi-core/token";
import { chainMap } from "~/stores/chain";
import { chainContext } from "~/utils/semi_core";
import { predictSafeAccountAddress } from "~/utils/SafeSmartAccount/account";
import {
  encodeAddOwnerCall,
  encodeChangeThresholdCall,
  encodeRemoveOwnerCall,
  encodeSwapOwnerCall,
  getSafeOwnersAndThreshold,
} from "~/utils/SafeSmartAccount/multisig";
import {
  addMultisigWalletChains,
  getMultisigWalletOwners,
  MultisigApiError,
  proposeMultisigTxGroup,
  type MultisigTx,
  type MultisigWallet,
} from "~/utils/multisig_api";

/** 多签可以同时存在的链。与后端 Wallet::MULTISIG_CHAIN_GROUPS 一致。 */
const MULTISIG_CHAIN_GROUPS: number[][] = [[10, 42161, 1], [11155111]];

/** 与 chainId 同组、且前端已配置的链 */
export function multisigChainIdsFor(chainId: number): number[] {
  const group = MULTISIG_CHAIN_GROUPS.find((g) => g.includes(chainId)) ?? [chainId];
  return group.filter((id) => chainMap[id]);
}

/** 同一 Safe、同一链组的所有钱包行（含自身） */
export function walletRowsOf(wallet: MultisigWallet, allWallets: MultisigWallet[]): MultisigWallet[] {
  const group = multisigChainIdsFor(wallet.chain_id);
  const address = wallet.safe_address.toLowerCase();
  return allWallets.filter(
    (w) => w.safe_address.toLowerCase() === address && group.includes(w.chain_id)
  );
}

export function chainName(chainId: number): string {
  return chainMap[chainId]?.name ?? `Chain ${chainId}`;
}

/**
 * 某条链上 Safe 的 owner 链表。已部署读链上；未部署时 Safe 会按排序后的初始
 * owner 部署（semi-core 的 sortOwners），而这一行的 owner 就是初始 owner。
 */
async function ownerListOnChain(wallet: MultisigWallet, rowOwners: Address[]): Promise<Address[]> {
  const chain = chainMap[wallet.chain_id];
  if (!chain) throw new Error(`Unsupported chain ${wallet.chain_id}`);
  if (await isDeployed(chainContext(chain.id), wallet.safe_address)) {
    const { owners } = await getSafeOwnersAndThreshold(wallet.safe_address, chain);
    return owners;
  }
  return [...rowOwners].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

function prevOwnerIn(list: Address[], owner: Address): Address {
  const idx = list.findIndex((o) => o.toLowerCase() === owner.toLowerCase());
  if (idx === -1) throw new Error(`${owner} is not an owner`);
  return idx === 0 ? (SENTINEL_OWNERS as Address) : list[idx - 1]!;
}

export type OwnerChange =
  | { type: "add_owner"; newOwner: Address; newThreshold: number }
  | { type: "remove_owner"; owner: Address; newThreshold: number }
  | { type: "replace_owner"; oldOwner: Address; newOwner: Address }
  | { type: "change_threshold"; newThreshold: number };

/** 与后端 config_change_applicable? 一致 */
function applicable(change: OwnerChange, owners: string[], threshold: number): boolean {
  const has = (a: string) => owners.includes(a.toLowerCase());
  switch (change.type) {
    case "add_owner":
      return !has(change.newOwner) && change.newThreshold >= 1 && change.newThreshold <= owners.length + 1;
    case "remove_owner":
      return has(change.owner) && owners.length > 1 && change.newThreshold >= 1 && change.newThreshold <= owners.length - 1;
    case "replace_owner":
      return has(change.oldOwner) && !has(change.newOwner);
    case "change_threshold":
      return change.newThreshold >= 1 && change.newThreshold <= owners.length && change.newThreshold !== threshold;
  }
}

/**
 * 在当前用户是 owner、且变更仍适用的每条链上发起同一项 owner 变更。
 * 返回 activeWallet 那条链上的交易（没有则返回第一笔）。
 */
export async function proposeOwnerChangeOnAllChains(
  activeWallet: MultisigWallet,
  allWallets: MultisigWallet[],
  currentUserAddress: string,
  change: OwnerChange
): Promise<MultisigTx> {
  const me = currentUserAddress.toLowerCase();
  const entries: { wallet_id: string; tx_type: string; call_detail: Record<string, any>; evm_call_data: string }[] = [];

  for (const wallet of walletRowsOf(activeWallet, allWallets)) {
    const { owners, threshold } = await getMultisigWalletOwners(wallet.id);
    const rowOwners = owners.map((o) => o.owner_address);
    const lower = rowOwners.map((a) => a.toLowerCase());
    if (!lower.includes(me) || !applicable(change, lower, threshold)) continue;

    let callDetail: Record<string, any>;
    let callData: Hex;
    switch (change.type) {
      case "add_owner":
        callDetail = { new_owner: change.newOwner, new_threshold: change.newThreshold };
        callData = encodeAddOwnerCall(change.newOwner, change.newThreshold);
        break;
      case "change_threshold":
        callDetail = { new_threshold: change.newThreshold };
        callData = encodeChangeThresholdCall(change.newThreshold);
        break;
      case "remove_owner": {
        const prev = prevOwnerIn(await ownerListOnChain(wallet, rowOwners), change.owner);
        callDetail = { owner: change.owner, prev_owner: prev, new_threshold: change.newThreshold };
        callData = encodeRemoveOwnerCall(prev, change.owner, change.newThreshold);
        break;
      }
      case "replace_owner": {
        const prev = prevOwnerIn(await ownerListOnChain(wallet, rowOwners), change.oldOwner);
        callDetail = { old_owner: change.oldOwner, new_owner: change.newOwner, prev_owner: prev };
        callData = encodeSwapOwnerCall(prev, change.oldOwner, change.newOwner);
        break;
      }
    }
    entries.push({ wallet_id: wallet.id, tx_type: change.type, call_detail: callDetail, evm_call_data: callData });
  }

  if (entries.length === 0) {
    throw new Error("这项变更在所有链上都已生效或不适用");
  }

  const { txs } = await proposeMultisigTxGroup({ txs: entries });
  return txs.find((t) => t.wallet_id === activeWallet.id) ?? txs[0]!;
}

/**
 * 为多签钱包启用同组的另一条链（钱包默认只在创建时那条链上）。任一成员都可以启用。
 *
 * 新行按初始配置建：没部署的链上，Safe 的有效成员就是初始成员。所以后端只在
 * 成员和门槛从没变过、也没有进行中的成员变更时才允许（否则新链上生效的会是
 * 旧成员）。初始配置是后端从历史记录还原的，这里先用它预测地址，对得上才启用。
 */
export async function enableMultisigChain(
  wallet: MultisigWallet,
  allWallets: MultisigWallet[],
  chainId: number
): Promise<MultisigWallet> {
  const rows = walletRowsOf(wallet, allWallets);
  const existing = rows.find((r) => r.chain_id === chainId);
  if (existing) return existing;
  if (!multisigChainIdsFor(wallet.chain_id).includes(chainId)) {
    throw new Error(`该数字身份不能在 ${chainName(chainId)} 上启用`);
  }

  const source = rows.find((r) => r.initial_owners?.length && r.initial_threshold);
  const chain = source && chainMap[source.chain_id];
  if (!source || !chain) throw new Error("缺少该数字身份的初始配置，无法启用新链");

  const predicted = await predictSafeAccountAddress({
    owners: source.initial_owners as Address[],
    threshold: source.initial_threshold!,
    chain,
  });
  if (predicted.toLowerCase() !== source.safe_address.toLowerCase()) {
    throw new Error("初始配置与数字身份地址不一致，无法启用新链");
  }

  try {
    const { wallets } = await addMultisigWalletChains({ wallet_id: source.id, chain_ids: [chainId] });
    const created = wallets.find((w) => w.chain_id === chainId);
    if (!created) throw new Error(`在 ${chainName(chainId)} 上启用失败，请刷新后重试`);
    return created;
  } catch (e) {
    if (e instanceof MultisigApiError && e.code === "config_changed") {
      throw new Error("该数字身份的成员或门槛已经变更过，不能再启用新链");
    }
    if (e instanceof MultisigApiError && e.code === "config_change_pending") {
      throw new Error("该数字身份有进行中的成员变更，完成或撤回后才能启用新链");
    }
    throw e;
  }
}

const DEPLOYED_TTL_MS = 60_000;
const deployedCache = new Map<string, { at: number; value: Promise<boolean> }>();

/**
 * Safe 在这条链上是否已「激活」（合约已部署）。未激活的链上地址照样能收款，
 * 第一笔多签交易执行时会顺带部署。结果缓存一分钟；执行完交易后传 fresh 刷新。
 */
export function isSafeActivated(address: string, chainId: number, fresh = false): Promise<boolean> {
  const key = `${chainId}:${address.toLowerCase()}`;
  const hit = deployedCache.get(key);
  if (!fresh && hit && Date.now() - hit.at < DEPLOYED_TTL_MS) return hit.value;
  const value = isDeployed(chainContext(chainId), address as Address).catch((e) => {
    deployedCache.delete(key);
    throw e;
  });
  deployedCache.set(key, { at: Date.now(), value });
  return value;
}

/**
 * 打开多签钱包时该用哪条链：当前链已激活就留在当前链；否则按链组顺序
 * （OP → Arbitrum → 主网）找第一条已激活、且当前用户在那条链上是签名人的链。
 * 哪条都没激活（新钱包）或读不到链上状态时返回 null，留在当前链。
 */
export async function preferredActivatedChain(
  wallet: MultisigWallet,
  allWallets: MultisigWallet[],
  currentChainId: number
): Promise<MultisigWallet | null> {
  const rows = walletRowsOf(wallet, allWallets);
  const byChain = new Map(rows.map((r) => [r.chain_id, r]));
  const safeCheck = (id: number) => isSafeActivated(wallet.safe_address, id).catch(() => null);

  if (byChain.has(currentChainId) && (await safeCheck(currentChainId)) !== false) return null;

  for (const id of multisigChainIdsFor(wallet.chain_id)) {
    if (id === currentChainId || !byChain.has(id)) continue;
    if ((await safeCheck(id)) === true) return byChain.get(id)!;
  }
  return null;
}
