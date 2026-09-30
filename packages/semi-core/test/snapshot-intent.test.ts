import { describe, expect, it } from "vitest";
import { custom, encodeFunctionData, erc20Abi, type Address, type Hex } from "viem";
import { optimism } from "viem/chains";
import {
  assertSnapshotMatchesCall,
  createSemiCore,
  encodeAddOwner,
  encodeSafeCallData,
  SnapshotMismatchError,
  type UserOpSnapshot,
} from "../src/index";
import { getVirtualSafeAccount } from "../src/account";

const SAFE: Address = "0x7a3Ed6502F876E4E940Eb34fb33309e8551C5070";
const BOB: Address = "0x00000000000000000000000000000000000000b0";
const EVIL: Address = "0x000000000000000000000000000000000000dEaD";
const USDC: Address = "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85";

const CALLS: { name: string; call: { to: Address; value?: bigint; data?: Hex } }[] = [
  { name: "ETH 转账", call: { to: BOB, value: 10n ** 16n } },
  {
    name: "ERC20 转账",
    call: {
      to: USDC,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [BOB, 1_000_000n] }),
    },
  },
  { name: "加 owner", call: { to: SAFE, data: encodeAddOwner(BOB, 2) } },
  { name: "拒签（空调用）", call: { to: SAFE, value: 0n, data: "0x" } },
];

const transport = custom({
  async request({ method }) {
    if (method === "eth_chainId") return "0xa";
    throw new Error(`unexpected RPC call: ${method}`);
  },
});
const ctx = createSemiCore({
  chains: [{ chain: optimism, rpcUrl: "https://op.example", transport }],
}).chain(10);

/**
 * 建快照时 callData 来自 permissionless 的 encodeCalls，核对时来自我们自己的
 * encodeSafeCallData。两者一旦不一致，所有正常提案都会被拒签；升级
 * permissionless 后这里失败，说明编码变了，不能直接升。
 * 后端 MultisigIntent 用的是同一组向量（semi-backend/test/services/multisig_intent_test.rb）。
 */
describe("encodeSafeCallData", () => {
  for (const { name, call } of CALLS) {
    it(`与 permissionless encodeCalls 一致：${name}`, async () => {
      const account = await getVirtualSafeAccount(ctx, { address: SAFE, threshold: 1 });
      const fromAccount = await account.encodeCalls([
        { to: call.to, value: call.value ?? 0n, data: call.data ?? "0x" },
      ]);
      expect(encodeSafeCallData(call)).toBe(fromAccount);
    });
  }
});

const snapshotFor = (call: { to: Address; value?: bigint; data?: Hex }): UserOpSnapshot => ({
  sender: SAFE,
  nonce: "7",
  callData: encodeSafeCallData(call),
  maxFeePerGas: "1000000",
  maxPriorityFeePerGas: "500000",
  verificationGasLimit: "900000",
  callGasLimit: "240000",
  preVerificationGas: "96000",
  validAfter: 0,
  validUntil: 0,
  initCode: "0x",
  chainId: 10,
});

describe("assertSnapshotMatchesCall", () => {
  const call = CALLS[0]!.call;
  const expected = { safeAddress: SAFE, chainId: 10, call, nonce: "7" };

  it("内容一致时通过（地址大小写不敏感）", () => {
    const s = snapshotFor(call);
    expect(() =>
      assertSnapshotMatchesCall(
        { ...s, sender: SAFE.toLowerCase() as Address, callData: s.callData.toUpperCase().replace("0X", "0x") as Hex },
        expected
      )
    ).not.toThrow();
  });

  it("没有 nonce 时（第一个签名人）不核对 nonce", () => {
    expect(() => assertSnapshotMatchesCall(snapshotFor(call), { ...expected, nonce: undefined })).not.toThrow();
  });

  const tampered: [string, Partial<UserOpSnapshot>][] = [
    ["callData", { callData: encodeSafeCallData({ to: EVIL, value: 10n ** 20n }) }],
    ["callData", { callData: encodeSafeCallData({ to: BOB, value: 10n ** 16n + 1n }) }],
    ["sender", { sender: EVIL }],
    ["chainId", { chainId: 42161 }],
    ["nonce", { nonce: "8" }],
  ];
  for (const [field, patch] of tampered) {
    it(`篡改 ${field} 被拒：${JSON.stringify(patch)}`, () => {
      const err = (() => {
        try {
          assertSnapshotMatchesCall({ ...snapshotFor(call), ...patch }, expected);
        } catch (e) {
          return e;
        }
      })();
      expect(err).toBeInstanceOf(SnapshotMismatchError);
      expect((err as SnapshotMismatchError).field).toBe(field);
    });
  }

  it("DELEGATECALL 形式的 callData 被拒", () => {
    // operation 是第 4 个参数字：0x + 选择器 8 位 + 前 3 个字各 64 位
    const hex = encodeSafeCallData(call);
    const opWordStart = 10 + 64 * 3;
    const withDelegate = (hex.slice(0, opWordStart) + "0".repeat(63) + "1" + hex.slice(opWordStart + 64)) as Hex;
    expect(() => assertSnapshotMatchesCall({ ...snapshotFor(call), callData: withDelegate }, expected)).toThrow(
      SnapshotMismatchError
    );
  });
});
