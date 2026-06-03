/**
 * Multisig utility functions for Safe Smart Account (ERC-4337 v0.7 + Safe 1.4.1)
 *
 * Flow:
 *  1. Proposer calls `buildMultisigUserOpSnapshot` to create the gas-locked snapshot
 *  2. Each signer calls `signSafeOpSnapshot` to produce an independent ECDSA signature
 *  3. Executor calls `executeMultisigUserOp` to assemble packed sig and submit to bundler
 */

import {
  type Address,
  type Hex,
  type Chain,
  concatHex,
  encodeFunctionData,
  encodePacked,
  createPublicClient,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { entryPoint07Address } from "viem/account-abstraction";
import { EIP712_SAFE_OPERATION_TYPE_V07 } from "./utils/index";
import { getVirtualSafeAccount } from "./account";
import { prepareClient } from "./utils/prepareClient";
import { estimateMultisigGas } from "./operation";
import { BUNDLER_URL, RPC_URL } from "../config";

// ─── Constants ────────────────────────────────────────────────────────────────

const SAFE_4337_MODULE_ADDRESS: Address = "0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226";
const SENTINEL_OWNERS: Address = "0x0000000000000000000000000000000000000001";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserOpSnapshot {
  sender: Address;
  nonce: string;
  callData: Hex;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  verificationGasLimit: string;
  callGasLimit: string;
  preVerificationGas: string;
  validAfter: number;
  validUntil: number;
  factory?: Address;
  factoryData?: Hex;
  initCode: Hex;
  chainId: number;
}

export interface CollectedSignature {
  signer_address: Address;
  signature: Hex;
}

// ─── Sign SafeOp EIP-712 hash from snapshot ──────────────────────────────────

/**
 * Independent sign step: each owner signs the SafeOp EIP-712 hash without
 * needing to interact with the bundler. Returns { signer, signature }.
 */
export async function signSafeOpSnapshot(
  privateKey: `0x${string}`,
  snapshot: UserOpSnapshot
): Promise<{ signer: Address; signature: Hex }> {
  const account = privateKeyToAccount(privateKey);

  const message = {
    safe: snapshot.sender,
    callData: snapshot.callData,
    nonce: BigInt(snapshot.nonce),
    initCode: snapshot.initCode ?? "0x",
    maxFeePerGas: BigInt(snapshot.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(snapshot.maxPriorityFeePerGas),
    preVerificationGas: BigInt(snapshot.preVerificationGas),
    verificationGasLimit: BigInt(snapshot.verificationGasLimit),
    callGasLimit: BigInt(snapshot.callGasLimit),
    paymasterAndData: "0x" as Hex,
    validAfter: snapshot.validAfter,
    validUntil: snapshot.validUntil,
    entryPoint: entryPoint07Address,
  };

  const signature = await account.signTypedData({
    domain: {
      chainId: snapshot.chainId,
      verifyingContract: SAFE_4337_MODULE_ADDRESS,
    },
    types: EIP712_SAFE_OPERATION_TYPE_V07,
    primaryType: "SafeOp",
    message,
  });

  return { signer: account.address, signature };
}

// ─── Build UserOp snapshot (first-signer responsibility) ─────────────────────

export interface BuildSnapshotParams {
  safeAddress: Address;
  owners: Address[];
  threshold: number;
  chain: Chain;
  calls: { to: Address; value?: bigint; data?: Hex }[];
  /** 拒签替换：使用与被替换交易相同的 Nonce */
  forcedNonce?: bigint;
}

/**
 * Build and lock the UserOp snapshot that all signers will commit to.
 * Call this when the first signer is about to sign. Returns the full snapshot
 * (with 1.5x gas buffer) to be stored alongside the transaction record.
 */
export async function buildMultisigUserOpSnapshot(
  params: BuildSnapshotParams
): Promise<UserOpSnapshot> {
  const { safeAddress, owners, threshold, chain, calls, forcedNonce } = params;

  const account = await getVirtualSafeAccount(safeAddress, chain, {
    threshold,
    owners,
  });
  const { publicClient } = await prepareClient(chain, false);

  // Encode callData through the Safe account
  const callData = await account.encodeCalls(
    calls.map((c) => ({
      to: c.to,
      value: c.value ?? 0n,
      data: c.data ?? "0x",
    }))
  );

  const nonce = forcedNonce ?? (await account.getNonce());

  // Estimate gas with buffer
  const rawGas = await estimateMultisigGas({ safeAddress, owners, threshold, chain, calls });

  // 1.5x on verificationGasLimit, 1.2x on others for multisig safety margin
  const verificationGasLimit = (rawGas.verificationGasLimit * 3n) / 2n;
  const callGasLimit = (rawGas.callGasLimit * 6n) / 5n;
  const preVerificationGas = (rawGas.preVerificationGas * 6n) / 5n;

  // Check deployment status
  const bytecode = await publicClient.getBytecode({ address: safeAddress });
  const isDeployed = !!bytecode && bytecode !== "0x";

  let factory: Address | undefined;
  let factoryData: Hex | undefined;
  let initCode: Hex = "0x";

  if (!isDeployed) {
    const factoryArgs = await account.getFactoryArgs();
    factory = factoryArgs.factory as Address;
    factoryData = factoryArgs.factoryData as Hex;
    initCode = concatHex([factory, factoryData]);
  }

  return {
    sender: safeAddress,
    nonce: nonce.toString(),
    callData: callData as Hex,
    maxFeePerGas: rawGas.maxFeePerGas.toString(),
    maxPriorityFeePerGas: rawGas.maxPriorityFeePerGas.toString(),
    verificationGasLimit: verificationGasLimit.toString(),
    callGasLimit: callGasLimit.toString(),
    preVerificationGas: preVerificationGas.toString(),
    validAfter: 0,
    validUntil: 0,
    factory,
    factoryData,
    initCode,
    chainId: chain.id,
  };
}

// ─── Pack collected signatures ────────────────────────────────────────────────

/**
 * Build the final packed signature from collected signatures.
 * Sorts by signer address (ascending), takes first `threshold` signatures,
 * then packs as Safe expects: encodePacked([uint48, uint48, bytes]).
 */
export function packMultisigSignatures(
  signatures: CollectedSignature[],
  threshold: number,
  validAfter = 0,
  validUntil = 0
): Hex {
  const sorted = [...signatures]
    .sort((a, b) => a.signer_address.toLowerCase().localeCompare(b.signer_address.toLowerCase()))
    .slice(0, threshold);

  const signatureBytes = concatHex(sorted.map((s) => s.signature));
  return encodePacked(["uint48", "uint48", "bytes"], [validAfter, validUntil, signatureBytes]);
}

// ─── Execute collected-signature UserOp ──────────────────────────────────────

/**
 * Submit the fully-signed multisig UserOp to the bundler via raw RPC.
 * Returns the userOpHash, then polls for receipt.
 */
export async function executeMultisigUserOp(
  snapshot: UserOpSnapshot,
  signatures: CollectedSignature[],
  threshold: number,
  chain: Chain
): Promise<{ userOpHash: Hex; txHash: Hex }> {
  const bundlerUrl = BUNDLER_URL[chain.id];
  if (!bundlerUrl) throw new Error(`No bundler URL for chain ${chain.id}`);

  const packedSig = packMultisigSignatures(
    signatures,
    threshold,
    snapshot.validAfter,
    snapshot.validUntil
  );

  const toHex = (n: string) => "0x" + BigInt(n).toString(16);

  // Build v0.7 UserOp for bundler RPC
  const userOp: Record<string, string | undefined> = {
    sender: snapshot.sender,
    nonce: toHex(snapshot.nonce),
    callData: snapshot.callData,
    callGasLimit: toHex(snapshot.callGasLimit),
    verificationGasLimit: toHex(snapshot.verificationGasLimit),
    preVerificationGas: toHex(snapshot.preVerificationGas),
    maxFeePerGas: toHex(snapshot.maxFeePerGas),
    maxPriorityFeePerGas: toHex(snapshot.maxPriorityFeePerGas),
    signature: packedSig,
  };

  if (snapshot.factory && snapshot.factoryData) {
    userOp.factory = snapshot.factory;
    userOp.factoryData = snapshot.factoryData;
  }

  // Send via eth_sendUserOperation
  const sendResp = await fetch(bundlerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_sendUserOperation",
      params: [userOp, entryPoint07Address],
      id: 1,
    }),
  });

  const sendData = await sendResp.json();
  if (sendData.error) {
    throw new Error(`Bundler error: ${sendData.error.message || JSON.stringify(sendData.error)}`);
  }

  const userOpHash = sendData.result as Hex;
  console.log("[Multisig UserOp Hash]:", userOpHash);

  // Poll for receipt
  const receipt = await pollForUserOpReceipt(bundlerUrl, userOpHash);
  const txHash = receipt.receipt?.transactionHash as Hex;

  return { userOpHash, txHash };
}

async function pollForUserOpReceipt(
  bundlerUrl: string,
  userOpHash: Hex,
  maxAttempts = 60,
  intervalMs = 3000
): Promise<any> {
  for (let i = 0; i < maxAttempts; i++) {
    const resp = await fetch(bundlerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getUserOperationReceipt",
        params: [userOpHash],
        id: 1,
      }),
    });
    const data = await resp.json();
    if (data.result) return data.result;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Timed out waiting for UserOp receipt");
}

// ─── Estimate gas for display (no private key needed) ────────────────────────

export async function estimateMultisigTransferGas(params: {
  safeAddress: Address;
  owners: Address[];
  threshold: number;
  chain: Chain;
  to: Address;
  value?: bigint;
  data?: Hex;
}): Promise<{ estimatedEth: string; breakdown: Record<string, string> }> {
  const { safeAddress, owners, threshold, chain, to, value = 0n, data = "0x" } = params;

  const gas = await estimateMultisigGas({
    safeAddress,
    owners,
    threshold,
    chain,
    calls: [{ to, value, data }],
  });

  const totalGas = gas.verificationGasLimit + gas.callGasLimit + gas.preVerificationGas;
  const estimatedWei = totalGas * gas.maxFeePerGas;
  const estimatedEth = (Number(estimatedWei) / 1e18).toFixed(6);

  return {
    estimatedEth,
    breakdown: {
      verificationGasLimit: gas.verificationGasLimit.toString(),
      callGasLimit: gas.callGasLimit.toString(),
      preVerificationGas: gas.preVerificationGas.toString(),
      maxFeePerGas: gas.maxFeePerGas.toString(),
    },
  };
}

// ─── Safe owner management call encoders ─────────────────────────────────────

const SAFE_OWNER_MANAGER_ABI = [
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
] as const;

/** Encode callData for Safe.addOwnerWithThreshold */
export function encodeAddOwnerCall(newOwner: Address, newThreshold: number): Hex {
  return encodeFunctionData({
    abi: SAFE_OWNER_MANAGER_ABI,
    functionName: "addOwnerWithThreshold",
    args: [newOwner, BigInt(newThreshold)],
  });
}

/**
 * Encode callData for Safe.removeOwner.
 * `prevOwner` is the owner that points to `owner` in the linked list
 * (use SENTINEL_OWNERS = 0x1 if owner is at the head of the list).
 */
export function encodeRemoveOwnerCall(
  prevOwner: Address,
  owner: Address,
  newThreshold: number
): Hex {
  return encodeFunctionData({
    abi: SAFE_OWNER_MANAGER_ABI,
    functionName: "removeOwner",
    args: [prevOwner, owner, BigInt(newThreshold)],
  });
}

/** Encode callData for Safe.changeThreshold */
export function encodeChangeThresholdCall(newThreshold: number): Hex {
  return encodeFunctionData({
    abi: SAFE_OWNER_MANAGER_ABI,
    functionName: "changeThreshold",
    args: [BigInt(newThreshold)],
  });
}

/** Encode callData for Safe.swapOwner */
export function encodeSwapOwnerCall(
  prevOwner: Address,
  oldOwner: Address,
  newOwner: Address
): Hex {
  return encodeFunctionData({
    abi: SAFE_OWNER_MANAGER_ABI,
    functionName: "swapOwner",
    args: [prevOwner, oldOwner, newOwner],
  });
}

/**
 * Read owners from deployed Safe and return them in linked-list order.
 * Also returns a function to get prevOwner for a given owner address.
 */
export async function getSafeOwners(
  safeAddress: Address,
  chain: Chain
): Promise<{
  owners: Address[];
  getPrevOwner: (owner: Address) => Address;
}> {
  const publicClient = createPublicClient({
    chain,
    transport: http(RPC_URL[chain.id]),
  });

  // Safe may not be deployed yet (counterfactual address). In that case, contract calls return "0x".
  const bytecode = await publicClient.getBytecode({ address: safeAddress });
  if (!bytecode || bytecode === "0x") {
    throw new Error(
      "该多签钱包合约尚未部署到链上（当前地址无合约代码）。请先发起一笔交易并完成执行后，再进行“链上同步/移除签名者”等链上读取操作。"
    );
  }

  const owners = (await publicClient.readContract({
    address: safeAddress,
    abi: SAFE_OWNER_MANAGER_ABI,
    functionName: "getOwners",
  })) as Address[];

  const getPrevOwner = (owner: Address): Address => {
    const idx = owners.findIndex((o) => o.toLowerCase() === owner.toLowerCase());
    if (idx === -1) throw new Error(`Owner ${owner} not found in Safe`);
    return idx === 0 ? SENTINEL_OWNERS : owners[idx - 1];
  };

  return { owners, getPrevOwner };
}

/**
 * Read the deployed Safe's current owners AND threshold in one shot.
 * Use this to refresh the backend DB mirror after owner/threshold config
 * transactions execute, so the queue always reflects on-chain reality.
 */
export async function getSafeOwnersAndThreshold(
  safeAddress: Address,
  chain: Chain
): Promise<{ owners: Address[]; threshold: number }> {
  const { owners } = await getSafeOwners(safeAddress, chain);
  const publicClient = createPublicClient({
    chain,
    transport: http(RPC_URL[chain.id]),
  });
  const threshold = (await publicClient.readContract({
    address: safeAddress,
    abi: [
      {
        name: "getThreshold",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ type: "uint256" }],
      },
    ],
    functionName: "getThreshold",
  })) as bigint;
  return { owners, threshold: Number(threshold) };
}

export async function getActualGasFee(
  txHash: `0x${string}`,
  chain: Chain
): Promise<string | null> {
  try {
    const publicClient = createPublicClient({
      chain,
      transport: http(RPC_URL[chain.id]),
    });
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
    if (!receipt || receipt.status === null) return null;
    const gasUsed = receipt.gasUsed;
    const effectiveGasPrice = receipt.effectiveGasPrice;
    if (!gasUsed || !effectiveGasPrice) return null;
    const actualWei = gasUsed * effectiveGasPrice;
    return (Number(actualWei) / 1e18).toFixed(6);
  } catch {
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Abbreviated address: 0x1234...abcd */
export function abbreviateAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
