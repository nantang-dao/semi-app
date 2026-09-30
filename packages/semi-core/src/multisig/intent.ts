import { encodeFunctionData, getAddress, isAddress, type Address, type Hex } from "viem";
import { SnapshotMismatchError } from "../errors";
import type { UserOpSnapshot } from "./types";

/** 一笔多签交易要执行的那一个调用 */
export interface MultisigCall {
  to: Address;
  value?: bigint;
  data?: Hex;
}

const EXECUTE_USER_OP_WITH_ERROR_STRING_ABI = [
  {
    name: "executeUserOpWithErrorString",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
      { name: "operation", type: "uint8" },
    ],
    outputs: [],
  },
] as const;

/**
 * 单个调用在 Safe 4337 模块下的 UserOp callData。
 *
 * 与 permissionless `toSafeSmartAccount().encodeCalls([call])` 逐字节相同
 * （test/snapshot-intent.test.ts 锁住这一点），但不需要 account 对象，也不联网。
 * operation 固定为 0（CALL）：多签不允许 DELEGATECALL，那等于把整个 Safe 交给目标合约。
 */
export function encodeSafeCallData(call: MultisigCall): Hex {
  return encodeFunctionData({
    abi: EXECUTE_USER_OP_WITH_ERROR_STRING_ABI,
    functionName: "executeUserOpWithErrorString",
    args: [call.to, call.value ?? 0n, call.data ?? "0x", 0],
  });
}

export interface ExpectedSnapshot {
  safeAddress: Address;
  chainId: number;
  call: MultisigCall;
  /** 后端为这笔交易记下的 nonce；还没有（第一个签名人）时不传 */
  nonce?: string | bigint;
}

/**
 * 签名前核对快照签下去的内容就是这笔交易本来的内容。
 *
 * `call` 必须由调用方从**展示给用户的字段**重新推出来，而不是取自快照或后端
 * 给的 calldata——否则比对的是攻击者提供的两份东西。
 *
 * gas / paymaster 字段不在这里核对：它们决定谁付费、付多少，不改变 Safe 执行什么。
 */
export function assertSnapshotMatchesCall(snapshot: UserOpSnapshot, expected: ExpectedSnapshot): void {
  if (!isAddress(snapshot.sender) || getAddress(snapshot.sender) !== getAddress(expected.safeAddress)) {
    throw new SnapshotMismatchError("sender", expected.safeAddress, String(snapshot.sender));
  }
  if (Number(snapshot.chainId) !== expected.chainId) {
    throw new SnapshotMismatchError("chainId", String(expected.chainId), String(snapshot.chainId));
  }
  if (expected.nonce !== undefined && BigInt(snapshot.nonce) !== BigInt(expected.nonce)) {
    throw new SnapshotMismatchError("nonce", String(expected.nonce), String(snapshot.nonce));
  }
  const callData = encodeSafeCallData(expected.call);
  if (String(snapshot.callData).toLowerCase() !== callData.toLowerCase()) {
    throw new SnapshotMismatchError("callData", callData, String(snapshot.callData));
  }
}
