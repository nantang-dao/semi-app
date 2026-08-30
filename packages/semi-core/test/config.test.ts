import { describe, expect, it, vi } from "vitest";
import { optimism, mainnet } from "viem/chains";
import { createSemiCore, ChainNotConfiguredError, ConfigError } from "../src/index";

const OK = { chain: optimism, rpcUrl: "https://op.example/v2/key" };

describe("createSemiCore 的配置校验", () => {
  it("至少要有一条链", () => {
    expect(() => createSemiCore({ chains: [] })).toThrow(ConfigError);
    expect(() => createSemiCore({ chains: [] })).toThrow(/at least one chain/);
  });

  it("空的 rpcUrl 在构造时就被拒", () => {
    expect(() => createSemiCore({ chains: [{ chain: optimism, rpcUrl: "" }] })).toThrow(
      /`rpcUrl` is empty/
    );
    expect(() => createSemiCore({ chains: [{ chain: optimism, rpcUrl: "   " }] })).toThrow(
      /`rpcUrl` is empty/
    );
  });

  /**
   * 这条是照着一次真实的生产故障写的：宿主用几个环境变量拼 RPC URL，
   * 服务端少注入了一个，于是拼出 `https://undefined/undefined`。
   * 当时的表现是链上调用失败，报错却指向别处。
   */
  it("URL 里出现 undefined / null 时报错，并指出是环境变量缺失", () => {
    const bad = "https://undefined/undefined";
    expect(() => createSemiCore({ chains: [{ chain: optimism, rpcUrl: bad }] })).toThrow(
      /environment variable is probably missing/
    );
    expect(() =>
      createSemiCore({ chains: [{ chain: optimism, rpcUrl: "https://rpc.example/null" }] })
    ).toThrow(/environment variable is probably missing/);
  });

  it("URL 格式非法时报错", () => {
    expect(() => createSemiCore({ chains: [{ chain: optimism, rpcUrl: "not-a-url" }] })).toThrow(
      /not a valid URL/
    );
  });

  it("可选端点也一样校验", () => {
    expect(() =>
      createSemiCore({ chains: [{ ...OK, bundlerUrl: "https://undefined/rpc" }] })
    ).toThrow(/`bundlerUrl`/);
    expect(() => createSemiCore({ chains: [{ ...OK, paymasterUrl: "" }] })).toThrow(
      /`paymasterUrl` is empty/
    );
  });

  it("同一条链配置两次时报错", () => {
    expect(() => createSemiCore({ chains: [OK, OK] })).toThrow(/configured twice/);
  });
});

describe("SemiCore 实例", () => {
  const core = createSemiCore({
    chains: [
      OK,
      { chain: mainnet, rpcUrl: "https://eth.example", bundlerUrl: "https://b.example" },
    ],
  });

  it("列出已配置的链", () => {
    expect(core.chainIds).toEqual([10, 1]);
    expect(core.has(10)).toBe(true);
    expect(core.has(137)).toBe(false);
  });

  it("取未配置的链时抛错，并列出有哪些可用", () => {
    expect(() => core.chain(137)).toThrow(ChainNotConfiguredError);
    try {
      core.chain(137);
    } catch (e) {
      expect((e as ChainNotConfiguredError).code).toBe("CHAIN_NOT_CONFIGURED");
      expect((e as ChainNotConfiguredError).chainId).toBe(137);
      expect((e as Error).message).toMatch(/10, 1/);
    }
  });

  it("没配 paymaster 的链 canSponsorGas 为 false", () => {
    expect(core.chain(10).canSponsorGas).toBe(false);
    const sponsored = createSemiCore({
      chains: [{ ...OK, paymasterUrl: "https://pm.example" }],
    });
    expect(sponsored.chain(10).canSponsorGas).toBe(true);
  });

  it("默认 logger 是 noop，传了就用传的", () => {
    expect(() => core.chain(10).logger.warn("x")).not.toThrow();
    const warn = vi.fn();
    const withLogger = createSemiCore({
      chains: [OK],
      logger: { debug: vi.fn(), warn },
    });
    withLogger.chain(10).logger.warn("hello", { a: 1 });
    expect(warn).toHaveBeenCalledWith("hello", { a: 1 });
  });
});
