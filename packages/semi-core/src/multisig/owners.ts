import { encodeFunctionData, type Address, type Hex } from "viem";
import { SENTINEL_OWNERS } from "../chains";
import type { ChainContext } from "../config";
import { SafeNotDeployedError } from "../errors";
import { isDeployed } from "../token";

const OWNER_MANAGER_ABI = [
  {
    name: "addOwnerWithThreshold",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "owner", type: "address" },
      { name: "_threshold", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "removeOwner",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "prevOwner", type: "address" },
      { name: "owner", type: "address" },
      { name: "_threshold", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "swapOwner",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "prevOwner", type: "address" },
      { name: "oldOwner", type: "address" },
      { name: "newOwner", type: "address" },
    ],
    outputs: [],
  },
  {
    name: "changeThreshold",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_threshold", type: "uint256" }],
    outputs: [],
  },
  {
    name: "getOwners",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address[]" }],
  },
  {
    name: "getThreshold",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export function encodeAddOwner(newOwner: Address, newThreshold: number): Hex {
  return encodeFunctionData({
    abi: OWNER_MANAGER_ABI,
    functionName: "addOwnerWithThreshold",
    args: [newOwner, BigInt(newThreshold)],
  });
}

/**
 * `prevOwner` 是链表中指向 `owner` 的那一个；owner 在表头时用
 * SENTINEL_OWNERS（0x1）。用 `getSafeOwners` 返回的 getPrevOwner 取，
 * 不要自己猜——顺序是链上的，不一定和你手里的列表一致。
 */
export function encodeRemoveOwner(prevOwner: Address, owner: Address, newThreshold: number): Hex {
  return encodeFunctionData({
    abi: OWNER_MANAGER_ABI,
    functionName: "removeOwner",
    args: [prevOwner, owner, BigInt(newThreshold)],
  });
}

export function encodeChangeThreshold(newThreshold: number): Hex {
  return encodeFunctionData({
    abi: OWNER_MANAGER_ABI,
    functionName: "changeThreshold",
    args: [BigInt(newThreshold)],
  });
}

export function encodeSwapOwner(prevOwner: Address, oldOwner: Address, newOwner: Address): Hex {
  return encodeFunctionData({
    abi: OWNER_MANAGER_ABI,
    functionName: "swapOwner",
    args: [prevOwner, oldOwner, newOwner],
  });
}

export interface SafeOwners {
  /** 链上链表顺序，不是任意顺序 */
  owners: Address[];
  threshold: number;
  getPrevOwner: (owner: Address) => Address;
}

/**
 * 读链上的 owner 列表和 threshold。
 *
 * Safe 可能还停在预测地址上没部署，那时合约调用返回 "0x"，会被误读成空
 * 列表——所以先查字节码。
 */
export async function getSafeOwners(ctx: ChainContext, safeAddress: Address): Promise<SafeOwners> {
  if (!(await isDeployed(ctx, safeAddress))) {
    throw new SafeNotDeployedError(safeAddress, ctx.chainId);
  }

  const [owners, threshold] = await Promise.all([
    ctx.publicClient.readContract({
      address: safeAddress,
      abi: OWNER_MANAGER_ABI,
      functionName: "getOwners",
    }),
    ctx.publicClient.readContract({
      address: safeAddress,
      abi: OWNER_MANAGER_ABI,
      functionName: "getThreshold",
    }),
  ]);

  const list = owners as readonly Address[];

  return {
    owners: [...list],
    threshold: Number(threshold),
    getPrevOwner: (owner: Address): Address => {
      const idx = list.findIndex((o) => o.toLowerCase() === owner.toLowerCase());
      if (idx === -1) throw new Error(`Owner ${owner} is not an owner of Safe ${safeAddress}`);
      return idx === 0 ? SENTINEL_OWNERS : list[idx - 1]!;
    },
  };
}

/** 一笔交易实际花掉的 gas（wei）。找不到回执时返回 null。 */
export async function getActualGasFee(ctx: ChainContext, txHash: Hex): Promise<bigint | null> {
  try {
    const receipt = await ctx.publicClient.getTransactionReceipt({ hash: txHash });
    if (!receipt?.gasUsed || !receipt.effectiveGasPrice) return null;
    return receipt.gasUsed * receipt.effectiveGasPrice;
  } catch {
    return null;
  }
}
