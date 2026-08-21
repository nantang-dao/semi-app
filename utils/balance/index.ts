import { POPULAR_ERC20_TOKENS, type TokenMetadata } from "./tokens";
import { createPublicClient, http, type Address, type Chain, erc20Abi } from "viem";
import { RPC_URL } from "~/utils/config";
import type { TokenClass } from "~/utils/semi_api";

export async function getBalance(address: Address, chain: Chain) {
  const client = createPublicClient({
    chain,
    transport: http(RPC_URL[chain.id]),
  });
  const balance = await client.getBalance({ address });
  return balance;
}

export async function getErc20Balance(address: Address, tokenAddress: Address, chain: Chain) {
  const client = createPublicClient({
    chain,
    transport: http(RPC_URL[chain.id]),
  });
  const balance = await client.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  });

  return balance;
}

export interface ERC20Balance {
  token: TokenClass;
  balance: bigint;
}

export async function getPopularERC20Balance(
  tokenClasses: TokenClass[],
  address: Address,
  chain: Chain
): Promise<ERC20Balance[]> {
  if (tokenClasses.length === 0) return [];

  const client = createPublicClient({
    chain,
    transport: http(RPC_URL[chain.id]),
  });

  // One multicall3 round trip instead of one eth_call per token. allowFailure
  // keeps a single bad token (self-destructed, non-standard) from taking down
  // the whole balance list — it just reads as 0.
  const results = await client.multicall({
    allowFailure: true,
    contracts: tokenClasses.map((token) => ({
      address: token.address as `0x${string}`,
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: [address] as const,
    })),
  });

  return tokenClasses.map((token, i) => {
    const result = results[i];
    if (result.status === "failure") {
      console.warn(`balanceOf failed for ${token.symbol} (${token.address}):`, result.error);
    }
    return {
      token,
      // BigInt(0) rather than 0n: the esbuild target is es2019, where bigint
      // literals are a syntax error.
      balance: result.status === "success" ? (result.result as bigint) : BigInt(0),
    };
  });
}
