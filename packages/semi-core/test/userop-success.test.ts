import { describe, expect, it } from "vitest";
import { custom, type Hex } from "viem";
import { optimism } from "viem/chains";
import { createSemiCore, UserOpFailedError, executeMultisigUserOp, safeOpHash, type UserOpSnapshot } from "../src/index";

/**
 * 上链 ≠ 成功。
 *
 * EntryPoint 会 catch 住内层调用的 revert：那笔 handleOps 交易本身成功
 * （回执 status 0x1），只是 UserOperationEvent 里的 success 是 false。
 * 光看「有没有拿到回执、有没有 transactionHash」，失败的转账和成功的一模一样。
 */

const SNAP: UserOpSnapshot = (() => {
  const base: UserOpSnapshot = {
    sender: "0x7a3Ed6502F876E4E940Eb34fb33309e8551C5070",
    nonce: "5",
    callData: "0xdeadbeef",
    maxFeePerGas: "1000000",
    maxPriorityFeePerGas: "500000",
    verificationGasLimit: "900000",
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

const USER_OP_HASH = `0x${"ab".repeat(32)}`;
const TX_HASH = `0x${"cd".repeat(32)}`;

/** 假 bundler：接收 UserOp，回执里的 success 由参数决定。 */
function coreWithBundler(success: boolean | undefined) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init: { body: string }) => {
    const { method } = JSON.parse(init.body) as { method: string };
    const result =
      method === "eth_sendUserOperation"
        ? USER_OP_HASH
        : {
            receipt: { transactionHash: TX_HASH },
            actualGasCost: "0x1234",
            ...(success === undefined ? {} : { success }),
          };
    return { json: async () => ({ jsonrpc: "2.0", id: 1, result }) };
  }) as unknown as typeof fetch;

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

describe("executeMultisigUserOp 检查 UserOp 是否真的成功", () => {
  it("success 为 true 时正常返回", async () => {
    const { core, restore } = coreWithBundler(true);
    try {
      const r = await executeMultisigUserOp(core.chain(10), SNAP, SIGS, 1);
      expect(r.txHash).toBe(TX_HASH);
      expect(r.actualGasCost).toBe(0x1234n);
    } finally {
      restore();
    }
  });

  /** 这一条就是「钱没动，但所有人都以为成了」的那个洞。 */
  it("success 为 false 时抛错，而不是当成执行成功", async () => {
    const { core, restore } = coreWithBundler(false);
    try {
      const err = await executeMultisigUserOp(core.chain(10), SNAP, SIGS, 1).catch((e) => e);
      expect(err).toBeInstanceOf(UserOpFailedError);
      expect(err.code).toBe("USER_OP_FAILED");
      // 两个 hash 都要带上：调用方需要它们来判断「已上链」并留证
      expect(err.txHash).toBe(TX_HASH);
      expect(err.userOpHash).toBe(USER_OP_HASH);
      expect(err.message).toMatch(/nonce was consumed/);
      expect(err.message).toMatch(/re-proposed/);
    } finally {
      restore();
    }
  });

  /** bundler 没给这个字段时无从判断，不能因此把成功的交易判成失败。 */
  it("bundler 不返回 success 字段时不当作失败", async () => {
    const { core, restore } = coreWithBundler(undefined);
    try {
      await expect(executeMultisigUserOp(core.chain(10), SNAP, SIGS, 1)).resolves.toHaveProperty(
        "txHash",
        TX_HASH
      );
    } finally {
      restore();
    }
  });
});
