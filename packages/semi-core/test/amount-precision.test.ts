import { describe, expect, it } from "vitest";
import { parseUnits } from "viem";

/**
 * 被替换掉的换算方式，逐字照抄自原 operation.ts：
 *   BigInt(Number(amount) * 10 ** decimals)
 * 中间经过一次 float64。
 */
function legacyAmount(amount: string, decimals: number): bigint {
  return BigInt(Number(amount) * 10 ** decimals);
}

describe("ERC20 金额换算", () => {
  it("小额、低精度时两种算法一致（所以问题一直没被发现）", () => {
    for (const [amount, decimals] of [
      ["1", 6],
      ["10.5", 6],
      ["0.01", 6],
      ["1", 18],
      ["2.5", 18],
    ] as const) {
      expect(legacyAmount(amount, decimals)).toBe(parseUnits(amount, decimals));
    }
  });

  it("18 位小数的大额会丢精度", () => {
    // 1234.5678901234567 个 token，18 位小数
    const amount = "1234.5678901234567";
    const correct = parseUnits(amount, 18);
    const legacy = legacyAmount(amount, 18);

    expect(correct).toBe(1234567890123456700000n);
    expect(legacy).not.toBe(correct);
    // 差额是实打实的 token，不是舍入噪声
    const diff = legacy > correct ? legacy - correct : correct - legacy;
    expect(diff).toBeGreaterThan(0n);
  });

  it("精度损失可以达到肉眼可见的量级", () => {
    // 1000 万个 token，带零头
    const amount = "10000000.000000000000000001";
    const correct = parseUnits(amount, 18);
    const legacy = legacyAmount(amount, 18);
    expect(correct - legacy).not.toBe(0n);
  });

  it("超过 float64 安全整数范围后旧算法直接错得离谱", () => {
    const amount = "9007199.254740993"; // 2^53 附近
    expect(legacyAmount(amount, 18)).not.toBe(parseUnits(amount, 18));
  });

  it("parseUnits 保留全部有效位", () => {
    expect(parseUnits("0.000000000000000001", 18)).toBe(1n);
    expect(parseUnits("123456789.123456789123456789", 18)).toBe(123456789123456789123456789n);
  });

  /**
   * 注意 parseUnits 是**四舍五入**，不是截断，也不抛错。
   * 用户在 6 位小数的 token 上输入 1.1234567，实际转出的是 1.123457
   * ——比屏幕上显示的多。UI 必须按 decimals 限制输入位数。
   */
  it("小数位超过 decimals 时 parseUnits 四舍五入", () => {
    expect(parseUnits("1.1234567", 6)).toBe(1123457n);
    expect(parseUnits("1.1234564", 6)).toBe(1123456n);
  });
});
