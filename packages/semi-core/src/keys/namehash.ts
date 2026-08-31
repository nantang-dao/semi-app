import { concat, keccak256, toHex, type Hex } from "viem";

const ZERO_NODE: Hex = `0x${"00".repeat(32)}`;

/**
 * ENS namehash（EIP-137）。
 *
 * 不做 UTS-46 normalize —— 与 Semi 一直以来的行为一致，输入按原样哈希。
 *
 * 特意不用 viem 的 `namehash`：它在 `viem/ens` 里，会把
 * `@adraffy/ens-normalize` 的 Unicode 码表（约 128 KB）一起拖进 bundle，
 * 而我们既然不 normalize，那张表一个字节都用不上。
 * 也不用原来那份 Node `Buffer` 实现——浏览器侧要靠打包器 polyfill 才能跑。
 */
export function namehash(name: string): Hex {
  if (!name) return ZERO_NODE;

  let node = ZERO_NODE;
  const labels = name.split(".");
  for (let i = labels.length - 1; i >= 0; i--) {
    const labelHash = keccak256(toHex(labels[i]!));
    node = keccak256(concat([node, labelHash]));
  }
  return node;
}
