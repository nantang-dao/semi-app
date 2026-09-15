# 依赖精简

记录 `feat/semi-core` 分支上把外部依赖砍掉的四件事，以及每件是怎么验证的。
写下来主要是为了两点：**为什么可以删**，和**凭什么相信没删坏**。

## 结果

|                | 起点    | 现在    |
| -------------- | ------- | ------- |
| 服务端 bundle  | 12.4 MB | 9.05 MB |
| 客户端 `_nuxt` | 2.7 MB  | 2.3 MB  |
| 运行时依赖     | 26      | 24      |

出局的：`ethers`、`solar-contract-sdk`、`alchemy-sdk`、`@wagmi/core`、Pimlico、Infura。

## 1. ZeroDev 统一三条链的 bundler

原来 mainnet 走 Pimlico，OP 和 Sepolia 走 ZeroDev —— 迁移做了一半留下的，
不是有意的分工。同一个 ZeroDev project id 在所有链上通用，链由 URL 路径里的
chain id 决定，所以四个变量并成一个：

```
VITE_MAINNET_BUNDLER_URL  ┐
VITE_OP_BUNDLER_URL       ├─→  VITE_ZERODEV_PROJECT_ID
VITE_SEPOLIA_BUNDLER_URL  │
VITE_OP_PAYMASTER         ┘
```

代付关系没变：`paymasterUrl` 只给 `sponsored: true` 的链（目前是 Optimism 和 Arbitrum），
`ctx.canSponsorGas` 仍由它决定。**代价**是开关从「删环境变量」变成「改一行
代码」——影响不大，因为 `VITE_*` 是构建期内联的，改环境变量本来也要重新构建。

验证：对真实 endpoint 三条链各查 `eth_chainId`、`eth_supportedEntryPoints`
（确认 EntryPoint 0.7 在列）、`pimlico_getUserOperationGasPrice`。ZeroDev 对
`pimlico_*` 和 `zd_*` 两个方法名返回相同结果，所以不必配 `gasPriceMethod`。

## 2. `alchemy-sdk` → `utils/alchemy.ts`

我们只用三个无状态 HTTP 接口：

```
alchemy_getAssetTransfers   转账历史（utils/actions.ts）
getNFTsForOwner             NFT 列表（server/utils/nft.ts）
getOwnersForNFT             持有者（server/api/nft/.../holders）
```

为此 SDK 要拖进 ethers v5（11 个 `@ethersproject` 包）、`@solana/web3.js`、
`axios` 和两个 websocket 库。而 `utils/actions.ts` 是**静态 import**，这些
全都进了客户端 bundle。

替换成 158 行 `fetch`，零依赖。REST 响应结构和 SDK 返回的对象同形，所以
`parseActionsFromAlchemyApi` 和 `getOwnedNFTs` 里的字段映射一行没动。

**唯一的真实差异**：SDK 会递归剔除 `null`，REST 原样返回，而这落在被消费的
字段上（`description: null` vs 字段不存在）。`stripNulls()` 跟随 SDK 行为。

验证：**在删掉依赖之前**，拿真实 key 对同一批查询同时调 SDK 和新实现，逐字段
diff —— 5 组 `getAssetTransfers`（三条链）、分页（两页内容相等、游标确实前进、
无重叠）、`contractAddresses` 过滤、2 组 `getNFTsForOwner`（40 个 token）、
2 组 `getOwnersForNFT`。全部相等。

> 过程中的一个教训：NFT 结果的**顺序在两次请求之间不稳定**。一开始按数组下标
> 比较，报出 292 处「差异」，全是错位。对拍必须按 `contract#tokenId` 对齐。

**这个测试留不下来**——它需要 SDK 本身作基准，而 SDK 已经删了。所以那是一次性
验证，不是回归保护。改 `utils/alchemy.ts` 时没有网可兜。

## 3. `@wagmi/core` → 纯 viem

`server/utils/solar_badge/index.ts` 是 2604 行 wagmi codegen 产物，167 个导出，
**实际被引用的只有 3 个**：`writeProfileRegistryCreateProfile`、
`writeProfileRegistryRegisterClass`、`writeBadgeUnboundedMint`。

在本地账户这条路径上，wagmi core 的 `writeContract` 就是转调 viem 的同名 action，
那层包装只换来一个依赖。现在：

- `server/utils/badge_wallet.ts` —— viem `createWalletClient`，account 和 chain 绑定
- `solar_badge/index.ts` 只留三个 ABI（2604 → 1282 行）
- 前端等回执改用 `chainContext(id).publicClient.waitForTransactionReceipt`

`badgeWalletClient` 的返回类型**故意不标注成 `WalletClient`**：那个宽泛类型会丢掉
account / chain 已绑定的信息，逼得每个调用点补 `account` 和 `chain`，或者退化成
`as any`。

验证：这次不能对拍（不能真发两笔交易比较），改用 fork —— 拿**真实的管理员私钥**
在 fork 的 Optimism 上对**真实合约**执行了全部三个写操作：

```
ProfileRegistry.createProfile   status=success  gas=102483
ProfileRegistry.registerClass   status=success  gas=76429   logs=1
BadgeUnbounded.mint             status=success  gas=119673  logs=2
```

合约地址、ABI、参数编码、管理员签名、gas 估算，整条链路都真的跑通了。

## 4. Alchemy 取代 Infura

RPC 主机名按链推导，一个 key 覆盖三条链，同一个 key 也用于索引 API。去掉了
`VITE_INFURA_API_KEY` 和三个 `VITE_*_RPC_URL`。

## 仍待处理

- **`.env.production` 需要手动清**（不在版本控制）：历史遗留的 `VITE_INFURA_API_KEY`、
  三个 `VITE_*_RPC_URL`、`VITE_PIMLICO_API_KEY`
- **Pimlico key 应当吊销** —— 代码已不再使用
- **登录后的链上流程仍未由人验证**：转账、多签发起 / 收签 / 执行。徽章那条现在有
  fork 验证兜底，这两条没有
