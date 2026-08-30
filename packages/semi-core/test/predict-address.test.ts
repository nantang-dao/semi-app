import { describe, expect, it } from "vitest";
import { createPublicClient, custom, type Address } from "viem";
import { optimism } from "viem/chains";
import { predictSafeAddress } from "../src/safe";
import { SAFE_1_4_1_PROXY_CREATION_CODE } from "./fixtures/proxy-creation-code";

/**
 * ProxyFactory 只被读一次（proxyCreationCode()，一个 pure 函数）。
 * 用固定返回值替代网络，测试因此是确定性的。
 */
const client = createPublicClient({
  chain: optimism,
  transport: custom({
    async request({ method }) {
      if (method === "eth_call") {
        const body = SAFE_1_4_1_PROXY_CREATION_CODE.slice(2);
        const len = (body.length / 2).toString(16).padStart(64, "0");
        const padded = body.padEnd(Math.ceil(body.length / 64) * 64, "0");
        return `0x${(32).toString(16).padStart(64, "0")}${len}${padded}`;
      }
      if (method === "eth_chainId") return "0xa";
      throw new Error(`unexpected RPC call: ${method}`);
    },
  }),
});

const A = "0x9858EfFD232B4033E47d90003D41EC34EcaEda94" as Address;
const B = "0xc0ffee254729296a45a3885639AC7E10F9d54979" as Address;
const C = "0x1111111111111111111111111111111111111111" as Address;
const D = "0xdddddddddddddddddddddddddddddddddddddddd" as Address;

/**
 * 基准值由**被替换掉的那份实现**（permissionless fork 里的
 * predictSafeSmartAccountAddress）算出，配真实的 proxyCreationCode。
 *
 * 这些就是线上用户钱包地址的算法产物。这组断言的意义不是「算得对」，
 * 而是「和以前算得一模一样」——差一个字节，老用户就再也找不到自己的钱。
 */
const GOLDEN: { name: string; owners: Address[]; threshold: number; expected: Address }[] = [
  {
    name: "单 owner",
    owners: [A],
    threshold: 1,
    expected: "0xf78B124D0f676153b37b7852658B5000b390984B",
  },
  {
    name: "单 owner（另一个）",
    owners: [B],
    threshold: 1,
    expected: "0xD1721dF17F81009Efa45Dd8a50E7e475bFC7008a",
  },
  {
    name: "2-of-2",
    owners: [A, B],
    threshold: 2,
    expected: "0x7a3Ed6502F876E4E940Eb34fb33309e8551C5070",
  },
  {
    name: "1-of-2",
    owners: [A, B],
    threshold: 1,
    expected: "0xfA64ea667587C5875029734Ce7681c78486E58fa",
  },
  {
    name: "2-of-3",
    owners: [A, B, C],
    threshold: 2,
    expected: "0xaeF8Cb1AB9D02e1d4cEfc38F58C8A38219449968",
  },
  {
    name: "3-of-3",
    owners: [A, B, C],
    threshold: 3,
    expected: "0x84C7f1955626Deb27b492a015De02F893C3F8D49",
  },
  {
    name: "2-of-4",
    owners: [A, B, C, D],
    threshold: 2,
    expected: "0xe82e10ae4dF4cff7B64Be3A7c5a89fe8d0f32109",
  },
  {
    name: "owner 顺序颠倒",
    owners: [C, B, A],
    threshold: 2,
    expected: "0x0486A082F047014CAbD45e292e0F23Fc8a7f307e",
  },
];

describe("predictSafeAddress 与旧实现的基准比对", () => {
  for (const c of GOLDEN) {
    it(c.name, async () => {
      const addr = await predictSafeAddress({
        client,
        chainId: optimism.id,
        owners: c.owners,
        threshold: c.threshold,
      });
      expect(addr).toBe(c.expected);
    });
  }
});

describe("predictSafeAddress 的性质", () => {
  const predict = (owners: Address[], threshold: number, saltNonce?: bigint) =>
    predictSafeAddress({ client, chainId: optimism.id, owners, threshold, saltNonce });

  it("owner 顺序不同 → 地址不同（所以调用方必须先排序）", async () => {
    expect(await predict([A, B, C], 2)).not.toBe(await predict([C, B, A], 2));
  });

  it("threshold 不同 → 地址不同", async () => {
    expect(await predict([A, B], 1)).not.toBe(await predict([A, B], 2));
  });

  it("saltNonce 不同 → 地址不同（同一批 owner 可开多个钱包）", async () => {
    expect(await predict([A], 1)).not.toBe(await predict([A], 1, 1n));
  });

  it("同样的输入永远给同样的输出", async () => {
    expect(await predict([A, B], 2)).toBe(await predict([A, B], 2));
  });

  it("owners 为空时抛错，而不是算出一个谁也控制不了的地址", async () => {
    await expect(predict([], 1)).rejects.toThrow(/owners must not be empty/);
  });

  it("threshold 超过 owner 数时抛错（这样的 Safe 永远无法执行交易）", async () => {
    await expect(predict([A, B], 3)).rejects.toThrow(/out of range/);
    await expect(predict([A], 0)).rejects.toThrow(/out of range/);
  });

  it("未部署 Safe 的链上抛错", async () => {
    await expect(
      predictSafeAddress({ client, chainId: 999999, owners: [A], threshold: 1 })
    ).rejects.toThrow(/No Safe v1.4.1 deployment/);
  });
});
