import { afterEach, describe, expect, it, vi } from "vitest";
import { custom } from "viem";
import { optimism } from "viem/chains";
import { createSemiCore, getUserOperationGasPrice } from "../src/index";

const BUNDLER = "https://bundler.example/rpc";

/** 只回 EIP-1559 估价需要的东西 */
const chainTransport = custom({
  async request({ method }) {
    if (method === "eth_chainId") return "0xa";
    if (method === "eth_getBlockByNumber")
      return { baseFeePerGas: "0x3b9aca00", number: "0x1", timestamp: "0x1", transactions: [] };
    if (method === "eth_maxPriorityFeePerGas") return "0x5f5e100";
    if (method === "eth_feeHistory")
      return {
        baseFeePerGas: ["0x3b9aca00", "0x3b9aca00"],
        gasUsedRatio: [0.5],
        oldestBlock: "0x1",
        reward: [["0x5f5e100"]],
      };
    throw new Error(`unexpected ${method}`);
  },
});

const core = (over: Record<string, unknown> = {}) =>
  createSemiCore({
    chains: [
      {
        chain: optimism,
        rpcUrl: "https://op.example",
        bundlerUrl: BUNDLER,
        transport: chainTransport,
        ...over,
      },
    ],
  }).chain(10);

const priceResponse = (fee: string, priority: string) => ({
  ok: true,
  json: async () => ({
    jsonrpc: "2.0",
    id: 1,
    result: {
      slow: { maxFeePerGas: fee, maxPriorityFeePerGas: priority },
      standard: { maxFeePerGas: fee, maxPriorityFeePerGas: priority },
      fast: { maxFeePerGas: fee, maxPriorityFeePerGas: priority },
    },
  }),
});

afterEach(() => vi.unstubAllGlobals());

describe("gas 价格来源", () => {
  it("默认问 bundler —— 决定这笔 UserOp 收不收的就是它", async () => {
    const fetchMock = vi.fn().mockResolvedValue(priceResponse("0x10dfd4", "0x10c8e0"));
    vi.stubGlobal("fetch", fetchMock);

    const price = await getUserOperationGasPrice(core());

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(BUNDLER); // 没有单独配 gasPriceUrl 时用 bundlerUrl
    expect(JSON.parse(init.body).method).toBe("pimlico_getUserOperationGasPrice");
    expect(price).toEqual({ maxFeePerGas: 0x10dfd4n, maxPriorityFeePerGas: 0x10c8e0n });
  });

  it("gasPriceUrl 可以单独指向别处", async () => {
    const fetchMock = vi.fn().mockResolvedValue(priceResponse("0x1", "0x1"));
    vi.stubGlobal("fetch", fetchMock);
    await getUserOperationGasPrice(core({ gasPriceUrl: "https://elsewhere.example" }));
    expect(fetchMock.mock.calls[0]![0]).toBe("https://elsewhere.example");
  });

  it("方法名可配 —— 4337 生态在这件事上没有标准", async () => {
    const fetchMock = vi.fn().mockResolvedValue(priceResponse("0x1", "0x1"));
    vi.stubGlobal("fetch", fetchMock);
    await getUserOperationGasPrice(core({ gasPriceMethod: "zd_getUserOperationGasPrice" }));
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).method).toBe("zd_getUserOperationGasPrice");
  });

  /**
   * 出一个可能被拒的价格，好过让整笔交易根本发不出去。
   * 原来的实现在这里直接抛错。
   */
  it("bundler 报错时退回链上估价，而不是让交易发不出去", async () => {
    const warn = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    const ctx = createSemiCore({
      chains: [
        {
          chain: optimism,
          rpcUrl: "https://op.example",
          bundlerUrl: BUNDLER,
          transport: chainTransport,
        },
      ],
      logger: { debug: vi.fn(), warn },
    }).chain(10);

    const price = await getUserOperationGasPrice(ctx);
    expect(price.maxFeePerGas).toBeGreaterThan(0n);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("falling back"), expect.anything());
  });

  it("RPC 层面的 error 同样退回", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ jsonrpc: "2.0", id: 1, error: { message: "Method not found" } }),
      })
    );
    const price = await getUserOperationGasPrice(core());
    expect(price.maxFeePerGas).toBeGreaterThan(0n);
  });

  it("返回体缺 standard 也退回", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ jsonrpc: "2.0", id: 1, result: {} }),
      })
    );
    const price = await getUserOperationGasPrice(core());
    expect(price.maxFeePerGas).toBeGreaterThan(0n);
  });

  it("没有 bundler 时直接用链上估价", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const ctx = createSemiCore({
      chains: [{ chain: optimism, rpcUrl: "https://op.example", transport: chainTransport }],
    }).chain(10);
    const price = await getUserOperationGasPrice(ctx);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(price.maxFeePerGas).toBeGreaterThan(0n);
  });
});
