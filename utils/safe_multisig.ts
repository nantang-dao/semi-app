import { hashTypedData, type Address, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"

export interface SafeTxParams {
  to: Address
  value: bigint
  data: Hex
  operation: number
  safeTxGas: bigint
  baseGas: bigint
  gasPrice: bigint
  gasToken: Address
  refundReceiver: Address
  nonce: number
  chainId: number
  safeAddress: Address
}

const SAFE_TX_TYPEHASH_TYPES = {
  SafeTx: [
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "data", type: "bytes" },
    { name: "operation", type: "uint8" },
    { name: "safeTxGas", type: "uint256" },
    { name: "baseGas", type: "uint256" },
    { name: "gasPrice", type: "uint256" },
    { name: "gasToken", type: "address" },
    { name: "refundReceiver", type: "address" },
    { name: "nonce", type: "uint256" },
  ],
} as const

export function computeSafeTxHash(params: SafeTxParams): Hex {
  return hashTypedData({
    domain: {
      chainId: params.chainId,
      verifyingContract: params.safeAddress,
    },
    types: SAFE_TX_TYPEHASH_TYPES,
    primaryType: "SafeTx",
    message: {
      to: params.to,
      value: params.value,
      data: params.data,
      operation: params.operation,
      safeTxGas: params.safeTxGas,
      baseGas: params.baseGas,
      gasPrice: params.gasPrice,
      gasToken: params.gasToken,
      refundReceiver: params.refundReceiver,
      nonce: BigInt(params.nonce),
    },
  })
}

export async function signSafeTxHash(safeTxHash: Hex, privateKey: Hex): Promise<Hex> {
  const account = privateKeyToAccount(privateKey)
  // Safe expects a plain ECDSA signature over the hash (not eth_sign prefixed)
  return account.sign({ hash: safeTxHash })
}

export function buildDefaultSafeTxParams(
  to: Address,
  value: bigint,
  data: Hex,
  nonce: number,
  chainId: number,
  safeAddress: Address,
  operation = 0
): SafeTxParams {
  return {
    to,
    value,
    data: data || "0x",
    operation,
    safeTxGas: 0n,
    baseGas: 0n,
    gasPrice: 0n,
    gasToken: "0x0000000000000000000000000000000000000000",
    refundReceiver: "0x0000000000000000000000000000000000000000",
    nonce,
    chainId,
    safeAddress,
  }
}
