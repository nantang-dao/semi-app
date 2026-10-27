import { afterEach, describe, expect, it, vi } from "vitest";
import type { Address, Hex } from "viem";
import {
  InsufficientFundsError,
  UserOpFailedError,
  isSponsorshipFailure,
  probePaymasterAvailable,
  PAYMASTER_DEPOSIT_FLOOR_WEI,
  type ChainContext,
} from "../src/index";

const SENDER = "0x" + "5a".repeat(20) as Address;
const PAYMASTER = "0x" + "cc".repeat(20);
// abi.encode(uint48 validUntil=0, uint48 validAfter=0) + 65 字节签名
const PAYMASTER_DATA = ("0x" + "00".repeat(64) + "11".repeat(65)) as Hex;

function context(over: Partial<Record<string, unknown>> = {}) {
  return {
    chainId: 10,
    canSponsorGas: true,
    paymasterUrl: "https://paymaster.invalid",
    logger: { warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn() },
    publicClient: {
      readContract: vi.fn(async ({ functionName }: { functionName: string }) =>
        functionName === "balanceOf" ? PAYMASTER_DEPOSIT_FLOOR_WEI * 10n : 0n
      ),
    },
    ...over,
  } as unknown as ChainContext;
}

afterEach(() => vi.unstubAllGlobals());

describe("isSponsorshipFailure", () => {
  it("已经交给 bundler 的交易不重发", () => {
    // 等回执超时这类：拿到过 userOpHash，钱可能已经动了
    expect(isSponsorshipFailure(new UserOpFailedError("timed out", undefined, { userOpHash: "0xabc" }))).toBe(false);
    // 已上链但内层 revert
    expect(isSponsorshipFailure(new UserOpFailedError("reverted", undefined, { txHash: "0xdef" }))).toBe(false);
    // 即使消息里带着 paymaster 字样也不能重发
    expect(isSponsorshipFailure(new UserOpFailedError("paymaster ran out of deposit", undefined, { userOpHash: "0xabc" }))).toBe(false);
  });

  it("提交前的代付失败可以重发", () => {
    expect(isSponsorshipFailure(new UserOpFailedError("AA33 reverted: paymaster signature invalid"))).toBe(true);
    expect(isSponsorshipFailure(new UserOpFailedError("paymaster rejected this operation"))).toBe(true);
    // 估 gas 阶段直接抛出的原始错误（没被包装过）
    expect(isSponsorshipFailure(new Error("sponsor fee exceeds policy limit"))).toBe(true);
  });

  it("和代付无关的失败不重发", () => {
    expect(isSponsorshipFailure(new InsufficientFundsError(0n, 1n))).toBe(false);
    expect(isSponsorshipFailure(new UserOpFailedError("AA25 invalid account nonce"))).toBe(false);
    expect(isSponsorshipFailure(new Error("user rejected the request"))).toBe(false);
    expect(isSponsorshipFailure("not an error")).toBe(false);
  });
});

describe("probePaymasterAvailable", () => {
  it("这条链没配 paymaster 就是确认不可用", async () => {
    expect(await probePaymasterAvailable(context({ canSponsorGas: false }), SENDER)).toBe(false);
    expect(await probePaymasterAvailable(context({ paymasterUrl: undefined }), SENDER)).toBe(false);
  });

  it("RPC 失败返回 null，不是「不可用」", async () => {
    const ctx = context({
      publicClient: {
        readContract: vi.fn(async () => {
          throw new Error("rpc is down");
        }),
      },
    });
    // null 让调用方照常先试代付，而不是直接按自付展示
    expect(await probePaymasterAvailable(ctx, SENDER)).toBeNull();
    expect((ctx.logger.warn as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it("paymaster 没给数据返回 null（占位 calldata 可能被策略拒）", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }), { status: 200 }))
    );
    expect(await probePaymasterAvailable(context(), SENDER)).toBeNull();
  });

  it("拿到 paymaster 时以 EntryPoint 里的存款为准", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        const { method } = JSON.parse(init.body) as { method: string };
        const result =
          method === "pm_getPaymasterStubData"
            ? { paymaster: PAYMASTER, paymasterVerificationGasLimit: "0x13880", paymasterPostOpGasLimit: "0x4e20" }
            : { paymaster: PAYMASTER, paymasterData: PAYMASTER_DATA };
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: 200 });
      })
    );
    expect(await probePaymasterAvailable(context(), SENDER)).toBe(true);

    // 存款低于底线：stub 会成功，但真付不了，所以判不可用
    const broke = context({
      publicClient: {
        readContract: vi.fn(async ({ functionName }: { functionName: string }) =>
          functionName === "balanceOf" ? PAYMASTER_DEPOSIT_FLOOR_WEI - 1n : 0n
        ),
      },
    });
    expect(await probePaymasterAvailable(broke, SENDER)).toBe(false);
  });
});
