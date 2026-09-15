# Fork 测试

这些测试跑在一个 fork Optimism 或 Arbitrum One 主网的 anvil 上，Safe 1.4.1 /
Safe4337Module / EntryPoint 0.7 都是链上真实合约，不是替身。

普通的 `pnpm test` **不会**跑它们——需要网络和 anvil。要跑：

```bash
anvil --fork-url "https://opt-mainnet.g.alchemy.com/v2/$VITE_ALCHEMY_API_KEY" --port 8545 --silent &
ANVIL_RPC=http://127.0.0.1:8545 pnpm vitest run test/fork
```

Arbitrum：fork `arb-mainnet`，并加 `FORK_CHAIN_ID=42161`（链 id 和 SafeOp 签名域都跟着变）。
在同一个 Arbitrum fork 上连续跑多个多签用例，第一个之后会报 `AA13 initCode failed or OOG`；
每个用例单独起新 anvil（`-t "<用例名>"`）都能通过，原因未查明，看起来是 anvil 的问题。

```bash
anvil --fork-url "https://arb-mainnet.g.alchemy.com/v2/$VITE_ALCHEMY_API_KEY" --port 8546 --silent &
FORK_CHAIN_ID=42161 ANVIL_RPC=http://127.0.0.1:8546 pnpm vitest run test/fork -t "多签 2-of-3"
```

anvil 的 fork 状态会在多次运行间累积。Safe 用固定的 saltNonce=0 部署，
所以**第二次运行同一个用例会以 `Create2 call failed` 失败**——重启 anvil 即可。

## 为什么值得

单元测试能验签名和编码，但验不了「这串字节被真实合约接受」。这里验的是：

- 预测地址 == 实际 CREATE2 部署出来的地址
- UserOperation 真的通过 EntryPoint.handleOps 执行，钱真的转出去
- 多签的打包签名真的过了 Safe 的 checkSignatures
- 部署出来的 Safe，owner、阈值、4337 module 都对
- 未部署的链上，部署与 removeOwner 能在同一笔 UserOp 里完成，prevOwner 按排序后的初始 owner 推算
  （多链多签在还没部署的链上执行 owner 变更就靠这一点）

**升级 permissionless 或改动 initializer 编码后必须跑这个。**
