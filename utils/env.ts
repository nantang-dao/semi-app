/**
 * 客户端要用的环境变量，**逐个静态列出**。
 *
 * 必须是 `import.meta.env.VITE_X` 这样的字面访问：Vite 只替换它实际看到的
 * 表达式。写成 `import.meta.env[key]` 这种动态取值，Vite 会把整个 env 对象
 * 序列化进 bundle，于是 .env 里每一个 VITE_* 都被打包进去——包括早就不用的
 * 和别处才需要的。
 */
const VITE_ENV: Record<string, string | undefined> = {
  VITE_ALCHEMY_API_KEY: import.meta.env.VITE_ALCHEMY_API_KEY,
  VITE_ZERODEV_PROJECT_ID: import.meta.env.VITE_ZERODEV_PROJECT_ID,
};

/**
 * 客户端由 Vite 在构建期内联上面那张表；Nitro 服务端则是运行时读
 * process.env —— 所以两边都要看。服务端用到的每个 VITE_* 都必须出现在
 * ginger.yml 的 secrets.inject 里。
 *
 * 单独成一个模块（而不是留在 utils/semi_core.ts 里），是因为 utils/alchemy.ts
 * 也要读同一个 key，而它既跑在浏览器里也跑在 Nitro 里。让它去 import
 * semi_core.ts 会把 viem/chains 和整个 createSemiCore 拖进 server/utils/nft.ts；
 * 让它自己读 process.env 则在浏览器里永远读不到——那正是 /actions 页面报
 * "VITE_ALCHEMY_API_KEY is missing" 的原因。
 */
export const env = (key: keyof typeof VITE_ENV | string): string | undefined => {
  const fromVite = VITE_ENV[key];
  if (fromVite) return fromVite;
  if (typeof process !== "undefined" && process.env) return process.env[key];
  return undefined;
};
