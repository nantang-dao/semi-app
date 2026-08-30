import type { Chain } from "viem";
import { parseActionsFromAlchemyApi, type ActionPreview } from "./display";
import { getAssetTransfers as fetchAssetTransfers, type AssetTransferCategory } from "./alchemy";
import type { TokenClass } from "./semi_api";
import type { TransactionRecord } from "./semi_api";

export const ACTIONS_INITIAL_PAGE_SIZE = 20;
export const ACTIONS_LOAD_MORE_SIZE = 30;

export interface ActionsPageResult {
  actions: ActionPreview[];
  pageKey?: string;
}

export interface ActionsFetchOptions {
  maxCount?: number;
  pageKey?: string;
}

// 获取资产转移记录
// docs: https://www.alchemy.com/docs/reference/getassettransfers-sdk-v3
const getAssetTransfers = async (
  address: string,
  direction: "from" | "to",
  chain: Chain,
  contractAddresses: string[],
  options?: ActionsFetchOptions
) => {
  try {
    const category: AssetTransferCategory[] = ["erc20", "external"];
    if (chain.id !== 10) {
      // optimism do not support internal transfer history indexing in alchemy api
      category.push("internal");
    }

    const params = {
      fromBlock: "0x0",
      excludeZeroValue: true,
      withMetadata: true,
      category,
      ...(direction === "from" ? { fromAddress: address } : { toAddress: address }),
      contractAddresses,
      maxCount: options?.maxCount ?? 50,
      order: "desc" as const,
      ...(options?.pageKey ? { pageKey: options.pageKey } : {}),
    };

    const response = await fetchAssetTransfers(chain.id, params);
    return { transfers: response.transfers, pageKey: response.pageKey };
  } catch (error) {
    console.error("Error fetching asset transfers:", error);
    throw new Error("Failed to fetch asset transfers");
  }
};

export function dedupeActionsByTxHex(actions: ActionPreview[]): ActionPreview[] {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = action.txHex.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function matchActionsWithTransactions(
  actions: ActionPreview[],
  transactions: TransactionRecord[]
): ActionPreview[] {
  return actions.map((action) => {
    const tx = transactions.find(
      (record) => record.tx_hash.toLowerCase() === action.txHex.toLowerCase()
    );
    return {
      ...action,
      id: tx?.id,
      memo: tx?.memo || action.memo,
      senderNote: tx?.sender_note,
      receiverNote: tx?.receiver_note,
      senderHandle: tx?.sender_handle,
      receiverHandle: tx?.receiver_handle,
    };
  });
}

export function collectUniqueTxHexes(...actionLists: ActionPreview[][]): string {
  const hashes = new Set<string>();
  for (const list of actionLists) {
    for (const action of list) {
      hashes.add(action.txHex);
    }
  }
  return Array.from(hashes).join(",");
}

export const getReceiveActions = async (
  safeAddress: string,
  chain: Chain,
  tokenClasses: TokenClass[],
  options?: ActionsFetchOptions
): Promise<ActionsPageResult> => {
  const contractAddresses = tokenClasses.map((token) => token.address);
  const { transfers, pageKey } = await getAssetTransfers(
    safeAddress,
    "to",
    chain,
    contractAddresses,
    options
  );
  return {
    actions: parseActionsFromAlchemyApi(transfers, chain, "income", tokenClasses),
    pageKey,
  };
};

export const getSendActionsV2 = async (
  safeAddress: string,
  chain: Chain,
  tokenClasses: TokenClass[],
  options?: ActionsFetchOptions
): Promise<ActionsPageResult> => {
  const contractAddresses = tokenClasses.map((token) => token.address);
  const { transfers, pageKey } = await getAssetTransfers(
    safeAddress,
    "from",
    chain,
    contractAddresses,
    options
  );
  return {
    actions: parseActionsFromAlchemyApi(transfers, chain, "outgoing", tokenClasses),
    pageKey,
  };
};
