import { describe, expect, it } from "vitest";
import { custom, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { optimism } from "viem/chains";
import { createSemiCore, predictSafeAddress } from "../src/index";
import { predictAddress } from "../src/account";
// account 走子路径：主入口不导出它，免得所有使用者被迫安装 permissionless
import { getSafeAccount, getVirtualSafeAccount } from "../src/account";
import { SAFE_1_4_1_PROXY_CREATION_CODE } from "./fixtures/proxy-creation-code";

/**
 * semi-core 里有**两套**算 Safe 地址的实现：
 *
 *   predictSafeAddress   —— 我们自己写的（src/safe/predict.ts）
 *   toSafeSmartAccount   —— permissionless 的，getSafeAccount 在用
 *
 * 两者必须永远一致，否则 UI 显示的收款地址和实际部署的地址会是两个。
 * 在此之前没有任何东西保证这一点——升级 permissionless 时若它改了
 * initializer 编码，只会在链上体现出来。
 *
 * 这组断言就是那道锁。升级 permissionless 后它若失败，说明**不能升**。
 */
const transport = custom({
  async request({ method }) {
    if (method === "eth_chainId") return "0xa";
    if (method === "eth_call") {
      const body = SAFE_1_4_1_PROXY_CREATION_CODE.slice(2);
      const len = (body.length / 2).toString(16).padStart(64, "0");
      return `0x${(32).toString(16).padStart(64, "0")}${len}${body.padEnd(Math.ceil(body.length / 64) * 64, "0")}`;
    }
    if (method === "eth_getCode") return "0x";
    throw new Error(`unexpected RPC call: ${method}`);
  },
});

const core = createSemiCore({
  chains: [{ chain: optimism, rpcUrl: "https://op.example", transport }],
});
const ctx = core.chain(10);

const key = (i: number) => `0x${(i + 1).toString(16).padStart(64, "0")}` as `0x${string}`;
const addr = (i: number) => privateKeyToAccount(key(i)).address;

describe("两套地址实现必须一致", () => {
  it("单签：getSafeAccount 与 predictSafeAddress 相同", async () => {
    const account = await getSafeAccount(ctx, { privateKey: key(0) });
    const predicted = await predictSafeAddress({
      client: ctx.publicClient,
      chainId: 10,
      owners: [addr(0)],
      threshold: 1,
    });
    expect(account.address).toBe(predicted);
  });

  const multisigCases: { name: string; owners: Address[]; threshold: number }[] = [
    { name: "2-of-2", owners: [addr(0), addr(1)], threshold: 2 },
    { name: "1-of-2", owners: [addr(0), addr(1)], threshold: 1 },
    { name: "2-of-3", owners: [addr(0), addr(1), addr(2)], threshold: 2 },
    { name: "3-of-5", owners: [0, 1, 2, 3, 4].map(addr), threshold: 3 },
  ];

  for (const c of multisigCases) {
    it(`多签 ${c.name}：虚拟账户与 predictSafeAddress 相同`, async () => {
      // owner 顺序会影响地址，两边都必须按同样规则排序
      const sorted = [...c.owners].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
      const predicted = await predictSafeAddress({
        client: ctx.publicClient,
        chainId: 10,
        owners: sorted,
        threshold: c.threshold,
      });
      const account = await getVirtualSafeAccount(ctx, {
        address: predicted,
        owners: c.owners,
        threshold: c.threshold,
      });
      // getVirtualSafeAccount 收的是已知地址，它复原的 initCode 必须指向同一处
      const { factory, factoryData } = await account.getFactoryArgs();
      expect(factory).toBeDefined();
      expect(factoryData).toBeDefined();

      const fresh = await getSafeAccount(ctx, {
        privateKey: key(0),
        owners: sorted,
        threshold: c.threshold,
      });
      expect(fresh.address).toBe(predicted);
    });
  }
});

/**
 * owner 顺序决定地址，而 permissionless 不排序（只排 attesters）。
 * 所以 semi-core 里每一个构造账户 / 预测地址的入口都必须用同一个排序规则。
 *
 * 这条曾经不成立：getSafeAccount 保留调用方给的顺序，而 predictAddress 和
 * getVirtualSafeAccount 都排序。传一个未排序的 owner 列表进去，就会得到一个
 * 和收款地址不同的钱包。
 */
describe("owner 顺序不影响结果", () => {
  const owners = [addr(2), addr(0), addr(4), addr(1), addr(3)];
  const reversed = [...owners].reverse();
  const threshold = 3;

  it("predictAddress 对任意输入顺序给出同一地址", async () => {
    const a = await predictAddress(ctx, { owners, threshold });
    const b = await predictAddress(ctx, { owners: reversed, threshold });
    expect(a).toBe(b);
  });

  it("getSafeAccount 对任意输入顺序给出同一地址，且等于 predictAddress", async () => {
    const expected = await predictAddress(ctx, { owners, threshold });
    for (const list of [owners, reversed]) {
      const account = await getSafeAccount(ctx, { privateKey: key(0), owners: list, threshold });
      expect(account.address).toBe(expected);
    }
  });

  it("getVirtualSafeAccount 同样", async () => {
    const expected = await predictAddress(ctx, { owners, threshold });
    for (const list of [owners, reversed]) {
      const account = await getVirtualSafeAccount(ctx, {
        address: expected,
        owners: list,
        threshold,
      });
      const { factory, factoryData } = await account.getFactoryArgs();
      expect(factory).toBeDefined();
      expect(factoryData).toBeDefined();
    }
    // 三个入口互相一致
    const viaPredictLow = await predictSafeAddress({
      client: ctx.publicClient,
      chainId: 10,
      owners: [...owners].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())),
      threshold,
    });
    expect(viaPredictLow).toBe(expected);
  });
});
