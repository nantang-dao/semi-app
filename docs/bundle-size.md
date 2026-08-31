# 客户端体积

2026-08-31 实测，数据来自 `.output/server/chunks/virtual/precomputed.mjs` 里的
静态依赖图 + 逐 chunk gzip。

## 首屏（不是所有 chunk 加总）

| 路由 | gzip |
|---|---|
| 入口（含 28 KB CSS） | 135 KB |
| `/` | 359 KB |
| `/transfer` | 375 KB |
| `/contacts` | 279 KB |
| `/receive` | ~250 KB |

## 最大的 chunk 是免费的

`D70AVgn6.js`（350 KB raw / **141 KB gzip**）是整个 `ox` barrel，也是构建里最大的一块。
但它是 permissionless 中 WebAuthn 的**动态** import：

```js
co = { importPromise: import('./D70AVgn6.js') }   // try/catch 包着
async function lo() { if (!co) throw Error("The 'ox' package is required for WebAuthn functionality…") }
```

项目不用 passkey，所以这 141 KB **永远不会被下载**，只占 CDN 磁盘。
照着 chunk 体积排序去做优化前，先确认它是否在静态图里。

## vue-qrcode-reader 改为按需加载

原先 `components/ScanQrcodeBtn.client.vue` 在顶层静态 import，于是被打进 `/transfer`
和 `/contacts` 两个路由。代价有两层：

- JS chunk **23.2 KB gzip**，随路由下载
- `barcode-detector` → `zxing-wasm@1.1.3` 在运行时从
  `https://fastly.jsdelivr.net/npm/zxing-wasm@1.1.3/dist/reader/…` 拉
  **952 KB（392 KB gzip）的 wasm**。它不在我们的产物里，任何只统计 `.output` 的方法都看不见。

改成弹窗打开时才加载：

```js
const QrcodeStream = defineAsyncComponent(() =>
  import("vue-qrcode-reader").then((m) => m.QrcodeStream),
);
```
```vue
<QrcodeStream v-if="open" … />
```

实测 `/transfer` 284.7 → 262.6 KB、`/contacts` 166.6 → 144.6 KB，各省 22 KB gzip，
且不扫码的用户不再触发那 392 KB 的 CDN 请求。

同一次改动修了一个 bug：模板里写的是 `@click="isOpen = true"`，而 ref 名为 `open`，
`isOpen` 并不存在 —— 扫码按钮此前很可能打不开弹窗。**该修复需要真机点一次摄像头流程确认。**

## 合约 / ABI：已无收益

- `utils/deploy/MinimalFactory.json` 里的 `rawMetadata` / `metadata` / `deployedBytecode`
  都是 solc 产物垃圾，但在产物中搜 `rawMetadata`、`compilationTarget` **零命中** ——
  Vite 的 JSON 具名导出已经摇干净，只留下真正用到的 `abi` 和 `bytecode`。
- `utils/deploy/Minimal.json`（107 KB）**没有任何地方 import**，不进 bundle，可从仓库删除。
- `AbiFunction`（12 KB gz）是 viem 自己的 ABI 编解码运行时，不是项目的 ABI 表，
  按需加载没有意义。

结论：ABI 按需加载这条路已经走完，不必再投入。

## BIP39 词表：已从 /transfer 移除

`keystoreToPrivateKey` 要处理助记词形式的 keystore，所以词表看起来是必需的。
但**解助记词并不需要词表** —— viem 的 `mnemonicToAccount` 走
`mnemonicToSeedSync`（对短语做 PBKDF2），源码里完全不引用 wordlist；
只有 `generateMnemonic` / `validateMnemonic` 才查表。

词表的唯一来源是 `generateMnemonicPhrase` 里的 `generateMnemonic(english)`。
`/transfer` 不用它，只是和 `mnemonicToPrivateKey` 同处一个模块，被一起拖进了 chunk。
把它拆到独立的 `packages/semi-core/src/keys/generate.ts` 之后：

| 路由 | 拆分前 | 拆分后 |
|---|---|---|
| `/transfer` | 304,107（含 english） | **297,270** |
| `/verify` | 295,465（含 english） | 295,167（仍含，正确） |
| `/index` | 285,567 | 285,611 |

省 **6.8 KB gzip**，不是整张表的 12.3 KB —— 那个 chunk 里还有 HD 派生代码，
`/transfer` 仍然要用，只摘掉了词表部分。`/verify`、`/paymentcode` 仍带着它，
这是对的，它们确实要生成助记词。

## 评估过但未做

- **`Link`（23 KB）+ `ccip`（23 KB）+ `BlockOverrides` / `AbiFunction` 出现在每一个路由**，
  包括只显示二维码的 `/receive`。成因是 viem client 的 transport 层被 store 顶层初始化
  拖了进来。要减必须让 `stores/chain` 延迟建 client —— 触及链上调用路径，风险不低，
  不建议与其他改动混在一起做。

## 测量方法的坑

本文的路由数字来自 `.output/server/chunks/virtual/precomputed.mjs` 里的静态依赖图，
按**命名 chunk** 求和。这个方法只在分块结构不变时可比。

踩过一次：给 `nuxt.config.ts` 加 `ignore: ["**/node_modules/**"]` 后，各路由数字骤降
73–93 KB，看着像巨大优化 —— 实际上是 `@nuxt/ui` 的组件扫描被挡掉、组件整个消失，
分块结构随之改变，两次的数字根本不可比。判断优化是否真实，要同时看
`Σ Total size` 有没有变，并且**用浏览器打开页面确认组件还在**。
详见 `docs/dev-server-fd-limit.md`。

## 依赖

17 个运行时依赖，`pnpm outdated` 为空。viem / ox / esbuild / vite / vue / vue-router /
rolldown 均已收敛为单份。仍有两份的 `@vueuse/core` 和 `unplugin` 都在 `@nuxt/ui` 内部，
不进产物。`vue-qrcode-reader` 是唯一体积大而使用率低的包，现已按需加载。
