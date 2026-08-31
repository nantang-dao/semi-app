import type { Address, Chain } from "viem";
import { getErc20Balances, getNativeBalance, getErc20Balance as coreGetErc20Balance } from "semi-core/token";
import { chainContext } from "~/utils/semi_core";
import type { TokenClass } from "~/utils/semi_api";

/**
 * 余额查询的适配层。
 *
 * semi-core 只认地址、只回余额；TokenClass 这类带 symbol/icon 的业务元数据
 * 是后端 API 的形状，在这里拼回去。
 */

export async function getBalance(address: Address, chain: Chain) {
  return getNativeBalance(chainContext(chain.id), address);
}

export async function getErc20Balance(address: Address, tokenAddress: Address, chain: Chain) {
  return coreGetErc20Balance(chainContext(chain.id), address, tokenAddress);
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
  const results = await getErc20Balances(
    chainContext(chain.id),
    address,
    tokenClasses.map((t) => t.address as Address)
  );
  return results.map((r, i) => ({ token: tokenClasses[i], balance: r.balance }));
}
