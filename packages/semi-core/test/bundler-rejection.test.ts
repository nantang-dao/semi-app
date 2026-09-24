import { describe, expect, it } from "vitest";
import { custom, type Hex } from "viem";
import { optimism } from "viem/chains";
import {
  bufferedMaxFeePerGas,
  createSemiCore,
  executeMultisigUserOp,
  safeOpHash,
  UserOpRejectedError,
  type UserOpSnapshot,
} from "../src/index";

/**
 * bundler 当场拒收（没进内存池、没上链）和「上链了但调用回滚」要区分开：
 * 前者同一份快照换个时机仍可能执行，后者必须重新发起。
 */

const SNAP: UserOpSnapshot = (() => {
  const base: UserOpSnapshot = {
    sender: "0x7a3Ed6502F876E4E940Eb34fb33309e8551C5070",
    nonce: "5",
    callData: "0xdeadbeef",
    maxFeePerGas: "26418480",
    maxPriorityFeePerGas: "132092",
    verificationGasLimit: "990000",
    callGasLimit: "240000",
    preVerificationGas: "96000",
    validAfter: 0,
    validUntil: 0,
    initCode: "0x",
    chainId: 10,
  };
  return { ...base, safeOpHash: safeOpHash(base) };
})();

const SIGS = [
  {
    signer_address: "0x0000000000000000000000000000000000000001" as const,
    signature: `0x${"11".repeat(65)}` as Hex,
  },
];

function coreRejecting(message: string) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({
    json: async () => ({ jsonrpc: "2.0", id: 1, error: { code: -32602, message } }),
  })) as unknown as typeof fetch;
  const core = createSemiCore({
    chains: [
      {
        chain: optimism,
        rpcUrl: "https://opt.example/rpc",
        bundlerUrl: "https://bundler.example/rpc",
        transport: custom({
          request: async ({ method }: { method: string }) => {
            if (method === "eth_chainId") return "0xa";
            throw new Error(`unexpected RPC: ${method}`);
          },
        }),
      },
    ],
  });
  return { core, restore: () => void (globalThis.fetch = originalFetch) };
}

describe("bundler 拒收", () => {
  it("出价低于 bundler 最低价：可重试，并带出最低价", async () => {
    const { core, restore } = coreRejecting(
      "maxFeePerGas must be at least 26555760 (current maxFeePerGas: 26418480) - use pimlico_getUserOperationGasPrice to get the current gas price"
    );
    try {
      const err = await executeMultisigUserOp(core.chain(10), SNAP, SIGS, 1).catch((e) => e);
      expect(err).toBeInstanceOf(UserOpRejectedError);
      expect(err.permanent).toBe(false);
      expect(err.minMaxFeePerGas).toBe(26555760n);
    } finally {
      restore();
    }
  });

  it("预付不足（AA21）：可重试", async () => {
    const { core, restore } = coreRejecting("AA21 didn't pay prefund");
    try {
      const err = await executeMultisigUserOp(core.chain(10), SNAP, SIGS, 1).catch((e) => e);
      expect(err).toBeInstanceOf(UserOpRejectedError);
      expect(err.aaCode).toBe("AA21");
      expect(err.permanent).toBe(false);
    } finally {
      restore();
    }
  });

  it("nonce 已被占用（AA25）：不可重试", async () => {
    const { core, restore } = coreRejecting("AA25 invalid account nonce");
    try {
      const err = await executeMultisigUserOp(core.chain(10), SNAP, SIGS, 1).catch((e) => e);
      expect(err).toBeInstanceOf(UserOpRejectedError);
      expect(err.permanent).toBe(true);
    } finally {
      restore();
    }
  });
});

describe("bufferedMaxFeePerGas", () => {
  it("L2 取 3 倍，L1 取 1.5 倍", () => {
    expect(bufferedMaxFeePerGas(42161, 26418480n)).toBe(79255440n);
    expect(bufferedMaxFeePerGas(10, 1000n)).toBe(3000n);
    expect(bufferedMaxFeePerGas(1, 1000n)).toBe(1500n);
    expect(bufferedMaxFeePerGas(11155111, 1000n)).toBe(1500n);
  });

  it("截图里那次的报价加余量后高于 bundler 15 小时后的最低价", () => {
    expect(bufferedMaxFeePerGas(42161, 26418480n) >= 26555760n).toBe(true);
  });
});
