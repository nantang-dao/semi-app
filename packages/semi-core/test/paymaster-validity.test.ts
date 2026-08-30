import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import { parsePaymasterValidity } from "../src/multisig";

const word = (n: bigint | number) => BigInt(n).toString(16).padStart(64, "0");
const SIG = "ab".repeat(65);
const data = (validUntil: bigint | number, validAfter: bigint | number = 0): Hex =>
  `0x${word(validUntil)}${word(validAfter)}${SIG}`;

describe("parsePaymasterValidity", () => {
  /**
   * 生产上 ZeroDev（rpc.zerodev.app，OP 主网）真实返回的形状：
   * 129 字节，validUntil 和 validAfter 都是 0 —— 赞助不过期。
   * 原来代码里那个「7 天」是本地凭空假设的，从没发给过 paymaster。
   */
  it("识别出「不过期」——这正是 ZeroDev 当前返回的", () => {
    expect(parsePaymasterValidity(data(0, 0))).toEqual({ validUntil: 0, validAfter: 0 });
  });

  it("解出真实的过期时间", () => {
    const until = 1893456000; // 2030-01-01
    expect(parsePaymasterValidity(data(until, 1700000000))).toEqual({
      validUntil: until,
      validAfter: 1700000000,
    });
  });

  it("长度不对就返回 null，不猜", () => {
    expect(parsePaymasterValidity("0x")).toBeNull();
    expect(parsePaymasterValidity("0xdeadbeef")).toBeNull();
    expect(parsePaymasterValidity(`0x${"00".repeat(128)}`)).toBeNull(); // 少一字节
    expect(parsePaymasterValidity(`0x${"00".repeat(130)}`)).toBeNull(); // 多一字节
  });

  it("字段超出 uint48 说明布局不是这个，返回 null", () => {
    expect(parsePaymasterValidity(data(2n ** 48n))).toBeNull();
    expect(parsePaymasterValidity(data(0, 2n ** 48n))).toBeNull();
    expect(parsePaymasterValidity(data(2n ** 48n - 1n))).not.toBeNull(); // 边界内
  });

  it("不带 0x 前缀也能解", () => {
    const raw = data(12345).slice(2) as Hex;
    expect(parsePaymasterValidity(raw)?.validUntil).toBe(12345);
  });
});

// ── 过期预检查的行为 ──────────────────────────────────────────────────────

import { createSemiCore, PaymasterExpiredError, executeMultisigUserOp } from "../src/index";
import { optimism } from "viem/chains";
import type { UserOpSnapshot } from "../src/multisig";

const core = createSemiCore({
  chains: [
    {
      chain: optimism,
      rpcUrl: "https://op.example",
      bundlerUrl: "https://bundler.example",
      paymasterUrl: "https://pm.example",
    },
  ],
});

const snapshot = (paymasterValidUntil: number): UserOpSnapshot => ({
  sender: "0x7a3Ed6502F876E4E940Eb34fb33309e8551C5070",
  nonce: "0",
  callData: "0x",
  maxFeePerGas: "1",
  maxPriorityFeePerGas: "1",
  verificationGasLimit: "1",
  callGasLimit: "1",
  preVerificationGas: "1",
  validAfter: 0,
  validUntil: 0,
  initCode: "0x",
  chainId: 10,
  paymaster: "0xCc6841da1cafB54Bc11cEd78a1222c290f0F3c7c",
  paymasterValidUntil,
});

const sigs = [
  {
    signer_address: "0xAAAA000000000000000000000000000000000001" as const,
    signature: "0xaa" as const,
  },
];

describe("执行前的赞助过期检查", () => {
  it("validUntil = 0 时不拦截 —— 这是 ZeroDev 的常态，拦了就等于永远发不出去", async () => {
    // 会因为连不上 bundler 而失败，但**不能**是 PaymasterExpiredError
    await expect(
      executeMultisigUserOp(core.chain(10), snapshot(0), sigs, 1)
    ).rejects.not.toBeInstanceOf(PaymasterExpiredError);
  });

  it("真的过期了才拦，并带上过期时间", async () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    await expect(
      executeMultisigUserOp(core.chain(10), snapshot(past), sigs, 1)
    ).rejects.toMatchObject({ code: "PAYMASTER_EXPIRED", expiredAt: past });
  });

  it("还没到期就放行", async () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    await expect(
      executeMultisigUserOp(core.chain(10), snapshot(future), sigs, 1)
    ).rejects.not.toBeInstanceOf(PaymasterExpiredError);
  });
});
