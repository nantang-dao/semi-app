import {
  hashTypedData, encodeFunctionData, decodeEventLog,
  keccak256, encodePacked, getContractAddress, createPublicClient, http,
  type Address, type Hex, type Chain,
} from "viem"
import { mainnet, sepolia, optimism } from "viem/chains"
import { V1_4_1_DEPLOYMENTS, RPC_URL } from "~/utils/config"
import { getSafeAccount } from "~/utils/SafeSmartAccount/account"
import { prepareClient } from "~/utils/SafeSmartAccount/utils/prepareClient"
import { pimlicoGetUserOperationGasPrice } from "~/utils/SafeSmartAccount/operation"

const SAFE_PROXY_FACTORY_ABI = [
  {
    name: "createProxyWithNonce",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_singleton", type: "address" },
      { name: "initializer", type: "bytes" },
      { name: "saltNonce", type: "uint256" },
    ],
    outputs: [{ name: "proxy", type: "address" }],
  },
  {
    name: "ProxyCreation",
    type: "event",
    inputs: [
      { name: "proxy", type: "address", indexed: true },
      { name: "singleton", type: "address", indexed: false },
    ],
  },
] as const

const SAFE_SETUP_ABI = [
  {
    name: "setup",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_owners", type: "address[]" },
      { name: "_threshold", type: "uint256" },
      { name: "to", type: "address" },
      { name: "data", type: "bytes" },
      { name: "fallbackHandler", type: "address" },
      { name: "paymentToken", type: "address" },
      { name: "payment", type: "uint256" },
      { name: "paymentReceiver", type: "address" },
    ],
    outputs: [],
  },
] as const

const SAFE_PROXY_CREATION_CODE_ABI = [
  {
    name: "proxyCreationCode",
    type: "function",
    stateMutability: "pure",
    inputs: [],
    outputs: [{ name: "", type: "bytes" }],
  },
] as const

const CHAIN_MAP: Record<number, Chain> = {
  1: mainnet,
  10: optimism,
  11155111: sepolia,
}
const ZERO = "0x0000000000000000000000000000000000000000" as Address

function getChain(chainId: number): Chain {
  const chain = CHAIN_MAP[chainId]
  if (!chain) throw new Error(`Unsupported chain: ${chainId}`)
  return chain
}

function getDeployment(chainId: number) {
  const deployment = V1_4_1_DEPLOYMENTS[chainId]
  if (!deployment) throw new Error(`No deployment config for chain ${chainId}`)
  return {
    singleton: deployment.safe as Address,
    fallbackHandler: deployment.compatibility_fallback_handler as Address,
    factoryAddress: deployment.safe_proxy_factory as Address,
  }
}

/**
 * Build the Safe `setup()` initializer. Owners are sorted ascending so the
 * resulting address is invariant to the order owners were added — predict and
 * deploy then always agree regardless of DB/array ordering.
 */
function buildInitializer(owners: Address[], threshold: number, fallbackHandler: Address): Hex {
  const sorted = [...owners].sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1))
  return encodeFunctionData({
    abi: SAFE_SETUP_ABI,
    functionName: "setup",
    args: [sorted, BigInt(threshold), ZERO, "0x", fallbackHandler, ZERO, 0n, ZERO],
  })
}

/** Generate a fresh, fixed-at-creation 256-bit saltNonce. */
export function randomSaltNonce(): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let hex = "0x"
  for (const b of bytes) hex += b.toString(16).padStart(2, "0")
  return BigInt(hex)
}

/**
 * Deterministically compute the Safe proxy address that `createProxyWithNonce`
 * would produce for these inputs, without deploying. Mirrors the factory's
 * CREATE2: salt = keccak256(keccak256(initializer) ++ saltNonce),
 * initCode = proxyCreationCode ++ abi.encode(singleton).
 */
export async function predictSafeAddress(
  owners: Address[],
  threshold: number,
  chainId: number,
  saltNonce: bigint,
): Promise<Address> {
  const chain = getChain(chainId)
  const { singleton, fallbackHandler, factoryAddress } = getDeployment(chainId)

  const initializer = buildInitializer(owners, threshold, fallbackHandler)

  const publicClient = createPublicClient({ chain, transport: http(RPC_URL[chainId]) })
  const proxyCreationCode = await publicClient.readContract({
    address: factoryAddress,
    abi: SAFE_PROXY_CREATION_CODE_ABI,
    functionName: "proxyCreationCode",
  })

  const salt = keccak256(
    encodePacked(["bytes32", "uint256"], [keccak256(initializer), saltNonce]),
  )
  const deploymentData = encodePacked(
    ["bytes", "uint256"],
    [proxyCreationCode, BigInt(singleton)],
  )

  return getContractAddress({
    opcode: "CREATE2",
    from: factoryAddress,
    salt,
    bytecode: deploymentData,
  })
}

export async function deploySafeMultisig(
  owners: Address[],
  threshold: number,
  chainId: number,
  saltNonce: bigint,
  privateKey: Hex,
): Promise<Address> {
  const chain = getChain(chainId)
  const { singleton, fallbackHandler, factoryAddress } = getDeployment(chainId)

  const initializer = buildInitializer(owners, threshold, fallbackHandler)

  // Submit via the user's smart account so the paymaster sponsors gas
  const smartAccount = await getSafeAccount(privateKey, chain)
  const { bundlerClient, paymasterClient } = await prepareClient(chain, true)

  const call = {
    abi: SAFE_PROXY_FACTORY_ABI,
    functionName: "createProxyWithNonce" as const,
    args: [singleton, initializer, saltNonce] as const,
    to: factoryAddress,
  }

  const gasPrice = await pimlicoGetUserOperationGasPrice(chain)
  const gas = await bundlerClient.estimateUserOperationGas({
    account: smartAccount,
    calls: [call],
    maxFeePerGas: gasPrice.maxFeePerGas,
    maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
  })

  const params: any = {
    account: smartAccount,
    calls: [call],
    ...gasPrice,
    ...gas,
    verificationGasLimit: BigInt(600000),
  }
  if (paymasterClient) params.paymaster = paymasterClient

  const userOpHash = await bundlerClient.sendUserOperation(params)
  const receipt = await bundlerClient.waitForUserOperationReceipt({ hash: userOpHash })

  const logs = receipt.receipt?.logs ?? receipt.logs ?? []
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: SAFE_PROXY_FACTORY_ABI,
        eventName: "ProxyCreation",
        data: log.data,
        topics: log.topics,
      })
      return (decoded.args as any).proxy as Address
    } catch {}
  }

  throw new Error("ProxyCreation event not found in receipt")
}

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
