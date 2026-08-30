# Fork 测试

这些测试跑在一个 fork Optimism 主网的 anvil 上，Safe 1.4.1 / Safe4337Module /
EntryPoint 0.7 都是链上真实合约，不是替身。

普通的 `pnpm test` **不会**跑它们——需要网络和 anvil。要跑：

```bash
anvil --fork-url "$VITE_OP_RPC_URL/$VITE_INFURA_API_KEY" --port 8545 --silent &
ANVIL_RPC=http://127.0.0.1:8545 pnpm vitest run test/fork
```

anvil 的 fork 状态会在多次运行间累积。Safe 用固定的 saltNonce=0 部署，
所以**第二次运行同一个用例会以 `Create2 call failed` 失败**——重启 anvil 即可。

## 为什么值得

单元测试能验签名和编码，但验不了「这串字节被真实合约接受」。这里验的是：

- 预测地址 == 实际 CREATE2 部署出来的地址
- UserOperation 真的通过 EntryPoint.handleOps 执行，钱真的转出去
- 多签的打包签名真的过了 Safe 的 checkSignatures
- 部署出来的 Safe，owner、阈值、4337 module 都对

**升级 permissionless 或改动 initializer 编码后必须跑这个。**
