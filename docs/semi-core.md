# semi-core

`packages/semi-core/` —— Semi 的区块链核心。Safe 智能账户、ERC-4337、密钥、
多签协调。**不依赖任何 Semi 后端**，客户端和 Nitro 服务端共用。

零运行时依赖，viem 作为 peer；`permissionless` 是可选 peer，只有
`semi-core/account` 用得到。

## 为什么抽出来

这些代码本来就是客户端和服务端共用的（`server/api/badge/**`、
`server/api/profile/create` 都在 import），只是靠 Nuxt 的 `@/` 别名硬凑在一起。
`nuxt.config.ts` 里那段把 Nitro 的 esbuild target 调到 es2020 的注释就是这个
耦合的化石——为了让服务端能吃下 `utils/` 里的 bigint 字面量而改了全局构建目标。

## 入口

| 入口                 | 内容                                       | 需要联网 | 需要 permissionless |
| -------------------- | ------------------------------------------ | -------- | ------------------- |
| `semi-core/keys`     | 助记词、keystore、私钥、namehash           | 否       | 否                  |
| `semi-core/chains`   | Safe 1.4.1 部署地址、EntryPoint、哨兵常量  | 否       | 否                  |
| `semi-core/safe`     | 地址预测、initializer 编码、SafeOp EIP-712 | 部分     | 否                  |
| `semi-core/token`    | 余额、decimals、是否已部署                 | 是       | 否                  |
| `semi-core/ops`      | UserOperation 提交、gas                    | 是       | 是                  |
| `semi-core/account`  | Safe 账户构造                              | 是       | **是**              |
| `semi-core/multisig` | 快照、签名、打包、执行、owner 管理         | 是       | 是                  |
| `semi-core`          | 以上全部（不含 `account`）                 |          |                     |

主入口**故意不导出 `account`**——否则只用 keys 的人也要装 permissionless。

## 配置注入

包不读宿主的环境变量：它不知道宿主用 Vite 还是 Nitro，也不该替宿主规定变量名。

```ts
const core = createSemiCore({
  chains: [{ chain: optimism, rpcUrl, bundlerUrl, paymasterUrl }],
});
const ctx = core.chain(10);
```

**构造时就校验**。URL 里出现 `undefined` / `null` 直接拒绝并提示「大概率是环境
变量没注入」——这条针对的是一次真实的生产故障：服务端漏注入变量，拼出
`https://undefined/undefined`，报错却指向别处。

app 侧的组装在 `utils/semi_core.ts`，那是整个应用**唯一**读环境变量的地方。

## 不在 semi-core 里的东西

判据：不发 RPC、不做密码学、不编解码 calldata 的，都不进。

|                                               | 为什么                                                     |
| --------------------------------------------- | ---------------------------------------------------------- |
| `utils/semi_api.ts` / `utils/multisig_api.ts` | Rails 后端客户端                                           |
| `utils/actions.ts` / `utils/display.ts`       | Alchemy 索引查询，不是链                                   |
| `deploy` / `deployToken`                      | CreateCall 和 TokenFactory 是 **Semi 自己部署的**业务合约  |
| `server/utils/solar_badge/**`                 | 同上，且是 wagmi 代码生成产物，会把 `@wagmi/core` 拖进来   |
| badge 铸造                                    | 用管理员私钥，必须留在服务端；semi-core 是客户端也会打包的 |
| `abbreviateAddress` / `exportKeyStore`        | 展示与 UI                                                  |

## 测试

```bash
pnpm test        # 113 个单元测试，全部不需要网络
pnpm test:fork   # 4 个 fork 测试，需要 anvil，见 test/fork/README.md
```

单元测试能验签名和编码，验不了「这串字节被真实合约接受」。fork 测试跑在
fork Optimism 主网的 anvil 上，Safe 1.4.1 / Safe4337Module / EntryPoint 0.7
都是链上真合约，验的是预测地址等于实际 CREATE2 部署地址、UserOperation 真的
通过 `EntryPoint.handleOps` 执行、钱真的转出去。

**升级 permissionless 或改动 initializer 编码后必须跑 fork 测试。**

### 三处基准比对

搬迁时对每一处「算错就出事」的逻辑都做了与旧实现的逐字节差分：

- **namehash** —— 算出的哈希已经写在链上（profile / badge 节点 id），
  16 个用例含中文、大写、emoji、生产中真实的节点形状
- **地址预测** —— 基准值由**被替换掉的实现**生成，配真实的 `proxyCreationCode`，
  8 组 owner/threshold 组合。差一个字节，老用户就再也找不到自己的钱
- **多签签名与打包** —— 含带 paymaster 赞助的情形，`paymasterAndData` 是签名
  原像的一部分

## 容易踩的地方

**owner 顺序决定钱包地址。** 它进 initializer，initializer 是 CREATE2 salt 的
原像。permissionless **不排序**（只排 ERC-7579 的 attesters）。semi-core 里所有
构造账户 / 预测地址的入口共用一个 `sortOwners`，并有测试断言三者对任意输入顺序
给出同一地址。

**多签快照是跨进程契约。** 它序列化进后端数据库、再取回来给下一个签名者用，
所以数值一律用字符串存，字段名和形状不能随意改。入口有 `assertValidSnapshot`：
往返中丢字段不会立刻报错，它会一路走到签名，算出一个看起来正常、实则错误的
哈希，最后在链上 `checkSignatures` 处 revert——而那已经是收齐所有签名之后。

**SafeOp 的 EIP-712 字段顺序和宽度是签名原像的一部分。**
`verificationGasLimit` / `callGasLimit` 和 `maxPriorityFeePerGas` / `maxFeePerGas`
这两对的顺序与 v0.6 相反，且是 uint128 不是 uint256。有测试逐个改动 13 个被签
字段，断言签名必须随之改变——防的是以后有人无意中把某个字段从原像里漏掉，
那样一个签名就能被重放到另一笔交易上。

**EntryPoint 0.6 和 0.7 的 SafeModuleSetup 地址不同。** 部署表里的
`add_module_lib`（`0x8EcD…`）是 0.6 的，`SAFE_MODULE_SETUP_ADDRESS`
（`0x2dd6…`）是 0.7 的。用错会算出完全不同的钱包地址。

## 外部服务

|             | 用途                                                                       |
| ----------- | -------------------------------------------------------------------------- |
| **Alchemy** | JSON-RPC（主机名按链推导，只需一个 key）+ 索引 API（转账历史、NFT 持有者） |
| **ZeroDev** | OP / Sepolia 的 bundler、paymaster、gas 报价                               |

gas 报价问的是 bundler，因为**决定这笔 UserOp 收不收的就是它**。取不到时退回
链上 EIP-1559 估价并记 warning——出一个可能被拒的价格，好过让交易根本发不出去。
