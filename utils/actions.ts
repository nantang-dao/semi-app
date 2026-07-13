import type { Chain } from "viem";
import { parseSendActions, parseActionsFromAlchemyApi, type ActionPreview } from "./display";
import { Alchemy, Network, AssetTransfersCategory, SortingOrder } from "alchemy-sdk";
import type { TokenClass } from "./semi_api";
import type { TransactionRecord } from "./semi_api";

// 网络映射配置
const CHAIN_TO_NETWORK: Record<number, Network> = {
  1: Network.ETH_MAINNET,
  10: Network.OPT_MAINNET,
  11155111: Network.ETH_SEPOLIA,
};

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

// 获取 Alchemy 实例
const getAlchemyInstance = (chain: Chain): Alchemy => {
  const network = CHAIN_TO_NETWORK[chain.id];
  if (!network) {
    throw new Error(`Unsupported chain ID: ${chain.id}`);
  }

  return new Alchemy({
    apiKey: import.meta.env.VITE_ALCHEMY_API_KEY,
    network,
  });
};

// 获取资产转移记录
// docs: https://www.alchemy.com/docs/reference/getassettransfers-sdk-v3
const getAssetTransfers = async (
  alchemy: Alchemy,
  address: string,
  direction: "from" | "to",
  chain: Chain,
  contractAddresses: string[],
  options?: ActionsFetchOptions
) => {
  try {
    const category = [AssetTransfersCategory.ERC20, AssetTransfersCategory.EXTERNAL];
    if (chain.id !== 10) {
      // optimism do not support internal transfer history indexing in alchemy api
      category.push(AssetTransfersCategory.INTERNAL);
    }

    const params = {
      fromBlock: "0x0",
      excludeZeroValue: true,
      withMetadata: true,
      category,
      ...(direction === "from" ? { fromAddress: address } : { toAddress: address }),
      contractAddresses,
      maxCount: options?.maxCount ?? 50,
      order: SortingOrder.DESCENDING,
      ...(options?.pageKey ? { pageKey: options.pageKey } : {}),
    };

    const response = await alchemy.core.getAssetTransfers(params);
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

// deprecated
export const getSendActions = async (safeAddress: string, chain: Chain) => {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const result = await fetch(
      `https://semi.mobit.app/api/actions?safeAddress=${safeAddress}&chainId=${chain.id}&timezone=${timezone}`
    );

    if (!result.ok) {
      throw new Error(`HTTP error! status: ${result.status}`);
    }

    const resultData = await result.json();
    return parseSendActions(resultData.results);
  } catch (error) {
    console.error("Error fetching send actions:", error);
    throw new Error("Failed to fetch send actions");
  }
};

export const getReceiveActions = async (
  safeAddress: string,
  chain: Chain,
  tokenClasses: TokenClass[],
  options?: ActionsFetchOptions
): Promise<ActionsPageResult> => {
  const alchemy = getAlchemyInstance(chain);
  const contractAddresses = tokenClasses.map((token) => token.address);
  const { transfers, pageKey } = await getAssetTransfers(
    alchemy,
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
  const alchemy = getAlchemyInstance(chain);
  const contractAddresses = tokenClasses.map((token) => token.address);
  const { transfers, pageKey } = await getAssetTransfers(
    alchemy,
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
