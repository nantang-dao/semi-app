import { sepolia, mainnet, optimism, type Chain } from "viem/chains";
import { getPopularERC20Balance, getBalance, type ERC20Balance } from "@/utils/balance";
import type { TokenClass } from "@/utils/semi_api";

const chains = {
  "11155111": sepolia,
  "1": mainnet,
  "10": optimism,
} as const;

const API_BASE_URL = "https://semi.fly.dev";

interface TokenClassResponse {
  result?: "ok";
  error?: string;
  token_classes: TokenClass[];
}

async function getTokenClasses(): Promise<TokenClassResponse> {
  const response = await fetch(`${API_BASE_URL}/get_token_classes`);

  if (!response.ok) {
    throw new Error(`Failed to fetch token classes: ${response.statusText}`);
  }

  return response.json();
}

export default defineEventHandler(async (event) => {
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

    // Fetch whitelisted token classes
    const { token_classes } = await getTokenClasses();

    // Filter tokens by chain_id
    const currentTokenClasses = token_classes.filter(
      (token) => token.chain_id === chain.id
    );

    // Fetch native balance
    const nativeBalance = await getBalance(
      wallet_address as `0x${string}`,
      chain
    );

    // Fetch ERC20 token balances
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
