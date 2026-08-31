import { describe, expect, it, vi } from "vitest";
import { custom } from "viem";
import { optimism } from "viem/chains";
import { ChainMismatchError, createSemiCore } from "../src/index";

/**
 * RPC 连错链是**静默故障**里最贵的一种。
 *
 * Safe 的官方部署在各链是同一批地址，proxyCreationCode 也一样，所以连错链
 * 算出来的钱包地址往往和对的那条一模一样 —— 地址这一层看不出任何问题。
 * 真正错的是 nonce、余额、是否已部署这些从链上读来的东西，而 SafeOp 签名
 * 里的 chainId 却来自配置。两边凑出来的是一份内容自相矛盾的签名。
 */

/** 一个只回答 eth_chainId 的假 transport，不联网。 */
const rpcReturning = (chainId: number, onCall?: () => void) =>
  custom({
    request: async ({ method }: { method: string }) => {
      if (method === "eth_chainId") {
        onCall?.();
        return `0x${chainId.toString(16)}`;
      }
      throw new Error(`unexpected RPC call: ${method}`);
    },
  });

const coreWith = (rpcChainId: number, onCall?: () => void) =>
  createSemiCore({
    chains: [
      {
        chain: optimism,
        rpcUrl: "https://opt.example/v2/secret-key",
        transport: rpcReturning(rpcChainId, onCall),
      },
    ],
  });

describe("assertChainId", () => {
  it("RPC 和配置是同一条链时通过", async () => {
    await expect(coreWith(10).chain(10).assertChainId()).resolves.toBeUndefined();
  });

  it("RPC 连着别的链时抛 ChainMismatchError，并带上两个链 id", async () => {
    const ctx = coreWith(1).chain(10);
    await expect(ctx.assertChainId()).rejects.toBeInstanceOf(ChainMismatchError);
    await ctx.assertChainId().catch((e: ChainMismatchError) => {
      expect(e.code).toBe("CHAIN_MISMATCH");
      expect(e.configured).toBe(10);
      expect(e.actual).toBe(1);
    });
  });

  /** RPC URL 的路径段通常就是 API key，不能进报错信息。 */
  it("报错只带主机名，不带 URL 路径", async () => {
    await coreWith(1)
      .chain(10)
      .assertChainId()
      .catch((e: Error) => {
        expect(e.message).toContain("opt.example");
        expect(e.message).not.toContain("secret-key");
      });
  });

  it("成功的结果被缓存，只发一次 eth_chainId", async () => {
    const onCall = vi.fn();
    const ctx = coreWith(10, onCall).chain(10);
    await Promise.all([ctx.assertChainId(), ctx.assertChainId()]);
    await ctx.assertChainId();
    expect(onCall).toHaveBeenCalledTimes(1);
  });

  /**
   * 失败**不**缓存：把一个 rejected promise 存下来，会让一次网络抖动永久
   * 毒化这个 context，之后每一笔交易都失败，而链其实是好的。
   */
  it("失败不缓存，下次重试", async () => {
    let fail = true;
    const core = createSemiCore({
      chains: [
        {
          chain: optimism,
          rpcUrl: "https://opt.example/rpc",
          transport: custom({
            request: async ({ method }: { method: string }) => {
              if (method !== "eth_chainId") throw new Error("unexpected");
              if (fail) throw new Error("network blip");
              return "0xa";
            },
          }),
        },
      ],
    });
    const ctx = core.chain(10);
    await expect(ctx.assertChainId()).rejects.toThrow(/network blip/);
    fail = false;
    await expect(ctx.assertChainId()).resolves.toBeUndefined();
  });
});
