/**
 * Multisig utility functions for Safe Smart Account (ERC-4337 v0.7 + Safe 1.4.1)
 *
 * Flow:
 *  1. Proposer calls `buildMultisigUserOpSnapshot` to create the gas-locked snapshot.
 *     Gas is sponsored by the Paymaster **by default** — the paymaster data is fetched
 *     and frozen into the snapshot at this point so that every owner signs the exact
 *     same SafeOp hash (paymasterAndData is part of the EIP-712 struct). If the chain
 *     has no Paymaster configured, it transparently falls back to wallet self-pay.
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
import { entryPoint07Address, createPaymasterClient } from "viem/account-abstraction";
import { EIP712_SAFE_OPERATION_TYPE_V07, getPaymasterAndData } from "./utils/index";
import { getVirtualSafeAccount } from "./account";
import { prepareClient } from "./utils/prepareClient";
import { estimateMultisigGas } from "./operation";
import { BUNDLER_URL, RPC_URL, PAYMASTER_URL } from "../config";
import { isGasSponsorshipChain } from "../gas_sponsorship";

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
  // ── Paymaster sponsorship (frozen at snapshot-build time) ──
  // All owners must sign over the same `paymasterAndData`, so it is locked here.
  // `paymasterAndData` is the PACKED form that goes into the EIP-712 SafeOp hash;
  // the individual fields below are the UNPACKED v0.7 userOp fields sent to the bundler.
  paymasterAndData?: Hex;
  paymaster?: Address;
  paymasterData?: Hex;
  paymasterVerificationGasLimit?: string;
  paymasterPostOpGasLimit?: string;
  /** true when gas is sponsored by the paymaster; false = wallet self-pay */
  sponsored?: boolean;
  /** unix timestamp (seconds) when the paymaster sponsorship expires; 0 = no expiry */
  paymasterValidUntil?: number;
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
    // Must match exactly what executeMultisigUserOp submits, or checkSignatures reverts.
    paymasterAndData: (snapshot.paymasterAndData ?? "0x") as Hex,
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
  /**
   * 是否使用 Paymaster 代付 gas。默认 true（代付）。
   * 若该链未配置 Paymaster，则自动回退为钱包自付。
   */
  sponsorFee?: boolean;
}

// ─── Paymaster sponsorship ───────────────────────────────────────────────────

// 7 days — long enough for any realistic multisig collection window
const PAYMASTER_VALIDITY_SECONDS = 7 * 24 * 60 * 60;

interface SponsorPaymasterFields {
  paymaster: Address;
  paymasterData: Hex;
  paymasterVerificationGasLimit: bigint;
  paymasterPostOpGasLimit: bigint;
  validUntil: number;
}

/**
 * Ask the configured Paymaster to sponsor this userOp (ERC-7677 `pm_getPaymasterData`).
 * Returns null when the chain has no paymaster configured. Throws on RPC/validation
 * failure so the caller can decide whether to fall back to self-pay.
 *
 * NOTE: a verifying paymaster signs over a validity window. Because multisig signature
 * collection can span a long time, the sponsorship may expire before execution — in
 * which case the snapshot must be rebuilt (re-proposed). This is inherent to binding
 * paymasterAndData into the signed SafeOp.
 */
async function fetchSponsorPaymasterData(
  chain: Chain,
  userOp: {
    sender: Address;
    nonce: bigint;
    callData: Hex;
    callGasLimit: bigint;
    verificationGasLimit: bigint;
    preVerificationGas: bigint;
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
    factory?: Address;
    factoryData?: Hex;
  }
): Promise<SponsorPaymasterFields | null> {
  const url = PAYMASTER_URL[chain.id];
  if (!url) return null;

  const paymasterClient = createPaymasterClient({ transport: http(url) });

  const validUntil = Math.floor(Date.now() / 1000) + PAYMASTER_VALIDITY_SECONDS;

  // viem returns a OneOf union (v0.6 `paymasterAndData` vs v0.7 split fields);
  // we target the v0.7 entryPoint so cast to read the split fields directly.
  // `context.validUntil` requests a 7-day validity window from the paymaster (ERC-7677).
  // ZeroDev's selfFunded paymaster signs a hash that includes paymasterVerificationGasLimit.
  // We must commit to a fixed non-zero value HERE so the on-chain hash matches the signature.
  // Passing 0 causes AA33 (EntryPoint allocates 0 gas → validatePaymasterUserOp OOG).
  const paymasterVerificationGasLimit = 600_000n;
  const paymasterPostOpGasLimit = 0n;

  const res: any = await paymasterClient.getPaymasterData({
    chainId: chain.id,
    entryPointAddress: entryPoint07Address,
    sender: userOp.sender,
    nonce: userOp.nonce,
    callData: userOp.callData,
    callGasLimit: userOp.callGasLimit,
    verificationGasLimit: userOp.verificationGasLimit,
    preVerificationGas: userOp.preVerificationGas,
    maxFeePerGas: userOp.maxFeePerGas,
    maxPriorityFeePerGas: userOp.maxPriorityFeePerGas,
    paymasterVerificationGasLimit,
    paymasterPostOpGasLimit,
    ...(userOp.factory ? { factory: userOp.factory, factoryData: userOp.factoryData } : {}),
    context: { validUntil },
  });

  if (!res.paymaster) return null;

  return {
    paymaster: res.paymaster as Address,
    paymasterData: (res.paymasterData ?? "0x") as Hex,
    paymasterVerificationGasLimit,
    paymasterPostOpGasLimit,
    validUntil,
  };
}

/**
 * Build and lock the UserOp snapshot that all signers will commit to.
 * Call this when the first signer is about to sign. Returns the full snapshot
 * (with 1.5x gas buffer) to be stored alongside the transaction record.
 */
export async function buildMultisigUserOpSnapshot(
  params: BuildSnapshotParams
): Promise<UserOpSnapshot> {
  const { safeAddress, owners, threshold, chain, calls, forcedNonce, sponsorFee = true } = params;

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

  // ── Paymaster sponsorship (default on) ──
  // Fetch & freeze the paymaster data NOW so every signer commits to the same
  // SafeOp hash. Falls back to self-pay if the chain has no paymaster or the
  // sponsorship request fails.
  let paymasterAndData: Hex = "0x";
  let paymaster: Address | undefined;
  let paymasterData: Hex | undefined;
  let paymasterVerificationGasLimit: string | undefined;
  let paymasterPostOpGasLimit: string | undefined;
  let sponsored = false;
  let paymasterValidUntil = 0;

  if (sponsorFee && isGasSponsorshipChain(chain.id)) {
    try {
      const pm = await fetchSponsorPaymasterData(chain, {
        sender: safeAddress,
        nonce,
        callData: callData as Hex,
        callGasLimit,
        verificationGasLimit,
        preVerificationGas,
        maxFeePerGas: rawGas.maxFeePerGas,
        maxPriorityFeePerGas: rawGas.maxPriorityFeePerGas,
        factory,
        factoryData,
      });
      if (pm) {
        paymaster = pm.paymaster;
        paymasterData = pm.paymasterData;
        paymasterVerificationGasLimit = pm.paymasterVerificationGasLimit.toString();
        paymasterPostOpGasLimit = pm.paymasterPostOpGasLimit.toString();
        // Pack into the EIP-712 form that the SafeOp signature commits to.
        paymasterAndData = getPaymasterAndData({
          paymaster: pm.paymaster,
          paymasterVerificationGasLimit: pm.paymasterVerificationGasLimit,
          paymasterPostOpGasLimit: pm.paymasterPostOpGasLimit,
          paymasterData: pm.paymasterData,
        } as any);
        sponsored = true;
        paymasterValidUntil = pm.validUntil;
      }
    } catch (e) {
      console.warn(
        "[Multisig] Paymaster sponsorship failed — falling back to wallet self-pay:",
        e
      );
    }
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
    paymasterAndData,
    paymaster,
    paymasterData,
    paymasterVerificationGasLimit,
    paymasterPostOpGasLimit,
    sponsored,
    paymasterValidUntil,
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
): Promise<{ userOpHash: Hex; txHash: Hex; actualGasCost: string }> {
  const bundlerUrl = BUNDLER_URL[chain.id];
  if (!bundlerUrl) throw new Error(`No bundler URL for chain ${chain.id}`);

  // Fail early with a clear message rather than getting a cryptic bundler rejection.
  if (snapshot.paymasterValidUntil && snapshot.paymasterValidUntil > 0) {
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec >= snapshot.paymasterValidUntil) {
      const expiredAt = new Date(snapshot.paymasterValidUntil * 1000).toLocaleString();
      throw new Error(
        `Paymaster sponsorship expired at ${expiredAt}. Please re-propose the transaction to refresh it.`
      );
    }
  }

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

  // Paymaster (v0.7 unpacked fields) — must correspond to the packed
  // paymasterAndData that the signatures committed to in the snapshot.
  if (snapshot.paymaster) {
    userOp.paymaster = snapshot.paymaster;
    userOp.paymasterData = snapshot.paymasterData ?? "0x";
    userOp.paymasterVerificationGasLimit = toHex(snapshot.paymasterVerificationGasLimit ?? "0");
    userOp.paymasterPostOpGasLimit = toHex(snapshot.paymasterPostOpGasLimit ?? "0");
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
    const msg = sendData.error.message || JSON.stringify(sendData.error);
    const hint = msg.includes("AA33")
      ? " (AA33: paymaster validatePaymasterUserOp reverted — paymaster sponsorship expired or policy rejected this operation)"
      : msg.includes("AA25")
      ? " (AA25: invalid nonce — a concurrent transaction changed the safe nonce, please re-propose)"
      : "";
    throw new Error(`Bundler error: ${msg}${hint}`);
  }

  const userOpHash = sendData.result as Hex;
  console.log("[Multisig UserOp Hash]:", userOpHash);

  // Poll for receipt
  const receipt = await pollForUserOpReceipt(bundlerUrl, userOpHash);
  const txHash = receipt.receipt?.transactionHash as Hex;

  // actualGasCost (wei) is what the paymaster actually paid — used to accredit
  // the gas cost to the executor in the backend DB.
  let actualGasCost = "0";
  try {
    if (receipt.actualGasCost) actualGasCost = BigInt(receipt.actualGasCost).toString();
  } catch {
    actualGasCost = "0";
  }

  return { userOpHash, txHash, actualGasCost };
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
