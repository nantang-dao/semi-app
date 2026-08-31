import { describe, expect, it } from "vitest";
import { keccak256, toHex as stringToHex } from "viem";
import { Buffer } from "node:buffer";
import { namehash } from "../src/keys/namehash";

/**
 * 与被替换掉的那份实现（原 utils/encryption.ts 的 getNamehash，
 * 基于 Node Buffer）做差分。它算出来的值已经写进了链上的 profile /
 * badge 节点 id，新实现必须逐字节一致，否则会指向不存在的节点。
 */
function legacyGetNamehash(name: string): string {
  let node = Buffer.alloc(32, 0);
  if (name) {
    const labels = name.split(".");
    for (let i = labels.length - 1; i >= 0; i--) {
      const labelSha = Buffer.from(keccak256(stringToHex(labels[i]!)).slice(2), "hex");
      node = Buffer.from(keccak256(Buffer.concat([node, labelSha])).slice(2), "hex");
    }
  }
  return "0x" + node.toString("hex");
}

describe("namehash 与旧实现差分", () => {
  const cases = [
    "",
    "eth",
    "foo.eth",
    "semi.im",
    "alice.semi.im",
    "a.b.c.d.e.f",
    "南塘",
    "南塘.eth",
    "UPPER.eth", // 大小写敏感，不 normalize
    "with-dash.eth",
    "123.eth",
    "..", // 空 label
    "emoji🌞.eth",
    // 生产中真实使用的形状：server/utils/index.ts 里的 profile / badge 节点
    "0xc0ffee254729296a45a3885639AC7E10F9d54979.10.semi",
    "cls123.0xc0ffee254729296a45a3885639AC7E10F9d54979.10.semi",
    "b1.cls123.0xc0ffee254729296a45a3885639AC7E10F9d54979.10.semi",
  ];

  for (const name of cases) {
    it(`「${name}」`, () => {
      expect(namehash(name)).toBe(legacyGetNamehash(name));
    });
  }
});
