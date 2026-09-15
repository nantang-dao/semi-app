import type { Chain } from "viem/chains";
import { getPopularERC20Balance, getBalance, type ERC20Balance } from "@/utils/balance";
import type { TokenClass } from "@/utils/semi_api";
import { SERVER_CHAINS } from "@/server/utils/chains";

const chains = SERVER_CHAINS;

interface TokenClassResponse {
  result?: "ok";
  error?: string;
  token_classes: TokenClass[];
}

// The token whitelist is global and changes rarely, but every balance request
// paid for a fresh round trip to Rails. Cache it briefly in the worker.
const TOKEN_CLASSES_TTL_MS = 60_000;
let tokenClassesCache: { expires: number; value: TokenClassResponse } | null = null;

async function getTokenClasses(apiBaseUrl: string): Promise<TokenClassResponse> {
  if (tokenClassesCache && tokenClassesCache.expires > Date.now()) {
    return tokenClassesCache.value;
  }

  const response = await fetch(`${apiBaseUrl}/get_token_classes`);

  if (!response.ok) {
    throw new Error(`Failed to fetch token classes: ${response.statusText}`);
  }

  const value = (await response.json()) as TokenClassResponse;
  tokenClassesCache = { expires: Date.now() + TOKEN_CLASSES_TTL_MS, value };
  return value;
}

export default defineEventHandler(async (event) => {
  const apiBaseUrl = getBackendUrl()
    .trim()
    .replace(/\/+$/, "");

  const query = getQuery(event);
  const { chain_id, wallet_address } = query;

  if (!wallet_address || !chain_id) {
    return {
      success: false,
      message: "Invalid parameters: wallet_address and chain_id are required",
    };
  }

  if (!chains[chain_id as keyof typeof chains]) {
    return {
      success: false,
      message: "Invalid chain id",
    };
  }

  const chain = chains[chain_id as keyof typeof chains];

  try {
    // Validate wallet address format
    if (typeof wallet_address !== "string" || !wallet_address.startsWith("0x")) {
      return {
        success: false,
        message: "Invalid wallet address format",
      };
    }

    // The native balance does not depend on the token whitelist, so both go out
    // at once rather than one after the other.
    const [{ token_classes }, nativeBalance] = await Promise.all([
      getTokenClasses(apiBaseUrl),
      getBalance(wallet_address as `0x${string}`, chain),
    ]);

    // Filter tokens by chain_id
    const currentTokenClasses = token_classes.filter(
      (token) => token.chain_id === chain.id
    );

    // Fetch ERC20 token balances (single multicall)
    const tokenBalances = await getPopularERC20Balance(
      currentTokenClasses,
      wallet_address as `0x${string}`,
      chain
    );

    // Sort by position (descending)
    const sortedBalances = tokenBalances.sort(
      (a, b) => Number(b.token.position - a.token.position)
    );

    return {
      success: true,
      message: "Token balances fetched successfully",
      data: {
        native_balance: nativeBalance.toString(),
        token_balances: sortedBalances.map((balance) => ({
          token: balance.token,
          balance: balance.balance.toString(),
        })),
      },
    };
  } catch (error) {
    console.error("Error fetching token balances:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to fetch token balances",
      data: {
        native_balance: "0",
        token_balances: [],
      },
    };
  }
});
