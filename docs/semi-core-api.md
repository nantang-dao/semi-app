# semi-core 接口文档

`packages/semi-core/` 的完整公开 API。设计取舍、边界划分和测试策略见
[semi-core.md](./semi-core.md)，这里只讲**怎么调**。

- 所有链上操作的第一个参数都是 `ctx: ChainContext`，由 `core.chain(chainId)` 取得。
- 金额一律 `bigint`，**最小单位**（wei / `10^decimals`）。包内不做单位换算。
- 所有错误都是 `SemiCoreError` 的子类，按 `error.code` 分支，**不要匹配 message 文本**。
- 包不读环境变量。app 侧的组装在 `utils/semi_core.ts`。

## 目录

| 入口                                        | 内容                              |
| ------------------------------------------- | --------------------------------- |
| [`semi-core`](#semi-core-1)                 | `createSemiCore` / `ChainContext` |
| [`semi-core/keys`](#semi-corekeys)          | 助记词、keystore、私钥、namehash  |
| [`semi-core/chains`](#semi-corechains)      | Safe 部署地址与常量               |
| [`semi-core/safe`](#semi-coresafe)          | 地址预测、initializer、EIP-712    |
| [`semi-core/account`](#semi-coreaccount)    | Safe 账户对象（需 permissionless）|
| [`semi-core/token`](#semi-coretoken)        | 余额、decimals、是否已部署        |
| [`semi-core/ops`](#semi-coreops)            | UserOperation 提交、gas           |
| [`semi-core/multisig`](#semi-coremultisig)  | 快照、签名、执行、owner 管理      |
| [错误](#错误)                                | 全部错误码                        |

主入口 `semi-core` 导出除 `account` 外的全部内容 —— `account` 单独放，否则只用
`keys` 的调用方也要装 `permissionless`。

---

## `semi-core`

### `createSemiCore(config)`

```ts
function createSemiCore(config: SemiCoreConfig): SemiCore

interface SemiCoreConfig {
  chains: ChainConfig[];
  logger?: Logger; // { debug(msg, data?), warn(msg, data?) }，默认静默
}

interface ChainConfig {
  chain: Chain;             // viem 的 chain 对象
  rpcUrl: string;           // 只读查询用的 JSON-RPC
  transport?: Transport;    // 覆盖默认的 http(rpcUrl)；测试可注入不联网的 transport
  bundlerUrl?: string;      // ERC-4337 bundler。不发 UserOp 就不需要
  paymasterUrl?: string;    // ERC-7677 paymaster。不配则该链只能自付 gas
  gasPriceUrl?: string;     // 留空 = bundlerUrl
  gasPriceMethod?: string;  // 默认 "pimlico_getUserOperationGasPrice"
}

interface SemiCore {
  readonly chainIds: number[];
  chain(chainId: number): ChainContext;  // 未配置抛 ChainNotConfiguredError
  has(chainId: number): boolean;
}
```

**配置在构造时就校验完**。URL 为空、不合法，或字符串里含 `undefined` / `null`，
一律立刻抛 `ConfigError`。最后这条是针对一次真实生产故障：服务端漏注入环境变量，
拼出 `https://undefined/undefined`，等到发交易时才炸，报错还指向别处。

同一条链配置两次也抛 `ConfigError`。

```ts
const core = createSemiCore({
  chains: [{ chain: optimism, rpcUrl, bundlerUrl, paymasterUrl }],
});
const ctx = core.chain(10);
```

### `ChainContext`

`core.chain(id)` 的返回值，几乎所有函数的第一个参数。

```ts
interface ChainContext {
  readonly chain: Chain;
  readonly chainId: number;
  readonly publicClient: PublicClient<Transport, Chain>;
  readonly logger: Logger;
  readonly bundlerUrl: string | undefined;
  readonly paymasterUrl: string | undefined;
  readonly gasPriceUrl: string | undefined;
  readonly gasPriceMethod: string;
  readonly canSponsorGas: boolean;   // 等价于 Boolean(paymasterUrl)
  readonly assertChainId: () => Promise<void>;
}
```

判断能不能代付 gas 用 `ctx.canSponsorGas`，不要自己去看 `paymasterUrl`。

`assertChainId()` 确认 RPC 真的连在 `chain.id` 这条链上，不一致抛
`ChainMismatchError`。**所有会签名或提交的入口都会先 await 它**，调用方一般不必自己调。
第一次发一次 `eth_chainId`，结果缓存在 context 上；失败不缓存，下次重试。

为什么值得专门查一次：Safe 的官方部署在各链是同一批地址，连错链算出来的钱包地址往往和
对的那条一模一样，地址这层看不出问题。真正错的是 nonce、余额、是否已部署这些**从链上
读来**的东西，而 SafeOp 签名里的 chainId 来自配置 —— 两边凑出一份内容自相矛盾的签名。

---

## `semi-core/keys`

纯计算，**不联网**。

### 助记词与私钥

```ts
function generateMnemonicPhrase(): string          // BIP-39 英文词表，12 词
function mnemonicToPrivateKey(mnemonic: string): Hex   // BIP-44 m/44'/60'/0'/0/0
function mnemonicToAddress(mnemonic: string): Address
function privateKeyToAddress(privateKey: Hex): Address
function isPrivateKey(value: string): value is Hex
```

`generateMnemonicPhrase` 单独一个模块：`english` 是 2048 词的常量表（打包后
12.3 KB gzip）。解锁 keystore 走的 `mnemonicToPrivateKey` 用的是
`mnemonicToSeedSync`（对短语做 PBKDF2），**不查词表** —— 所以只解锁不生成的页面
（转账等）不会加载它。

`privateKeyToAddress` 返回的是 **signer 的 EOA 地址，不是 Safe 智能账户地址**。
后者要用 `predictSafeAddress` / `predictAddress`。

### Keystore

```ts
interface Keystore {
  version: number;
  crypto: {
    ciphertext: string; iv: string; salt: string;
    kdf: "pbkdf2"; cipher: "aes-gcm"; iterations: number; hash: "SHA-256";
  };
}

function encryptToKeystore(secret: string, passcode: string): Promise<Keystore>
function decryptKeystore(keystore: Keystore, passcode: string): Promise<string>
function keystoreToPrivateKey(keystore: Keystore, passcode: string): Promise<Hex>
```

`encryptToKeystore` 收任意秘密串（助记词或裸私钥）。**keystore 的强度完全取决于
passcode**，这里没有别的熵源。

`keystoreToPrivateKey` 是常用的那个：解开后按格式判断是助记词还是裸私钥，两种都
支持（新建钱包存助记词，从别处导入的存私钥）。

抛 `KeystoreError`，两个 code 要分开处理，UI 提示完全不同：

| code                    | 含义                                            |
| ----------------------- | ----------------------------------------------- |
| `KEYSTORE_BAD_PASSCODE` | AES-GCM 认证标签校验失败 —— 基本就是口令输错了  |
| `KEYSTORE_MALFORMED`    | 文件结构坏了（缺 `crypto` 等）                  |

### namehash

```ts
function namehash(name: string): Hex   // ENS EIP-137
```

**不做 UTS-46 normalize**，输入按原样哈希 —— 与 Semi 一直以来的行为一致，算出的
哈希已经写在链上（profile / badge 的节点 id）。不用 viem 的 `namehash`，是因为
它会把 `@adraffy/ens-normalize` 约 128 KB 的 Unicode 码表拖进 bundle，而我们既然
不 normalize，那张表一个字节都用不上。

---

## `semi-core/chains`

```ts
const ENTRY_POINT_07_ADDRESS: Address    // 0x0000000071727De22E5E9d8BAf0edAc6f37da032
const SAFE_4337_MODULE_ADDRESS: Address  // 0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226
const SAFE_MODULE_SETUP_ADDRESS: Address // 0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47
const SENTINEL_OWNERS: Address           // 0x0000000000000000000000000000000000000001

const SAFE_V1_4_1_DEPLOYMENTS: Record<number, SafeDeployment>
function getSafeDeployment(chainId: number): SafeDeployment  // 未知链抛 Error
```

`SAFE_4337_MODULE_ADDRESS` 同时是 SafeOp EIP-712 的 `verifyingContract`。

⚠️ `SAFE_MODULE_SETUP_ADDRESS`（`0x2dd6…`）是 **EntryPoint 0.7** 的。部署表里的
`add_module_lib`（`0x8EcD…`）是 0.6 的那个。**用错会算出完全不同的钱包地址。**

`SENTINEL_OWNERS` 是 Safe owner 链表的哨兵头节点，删 owner 时用（见
`encodeRemoveOwner`）。

---

## `semi-core/safe`

### `predictSafeAddress(params)`

```ts
function predictSafeAddress(params: PredictSafeAddressParams): Promise<Address>

interface PredictSafeAddressParams {
  client: Client<Transport, Chain | undefined>;  // 只用来读 proxyCreationCode()
  chainId: number;
  owners: Address[];
  threshold: number;
  saltNonce?: bigint;    // 同一批 owner 要第二个钱包时改这个。默认 0n
  overrides?: {          // 私链用；留空取官方部署地址
    safeProxyFactoryAddress?: Address;
    safeSingletonAddress?: Address;
    multiSendAddress?: Address;
    safeModuleSetupAddress?: Address;
    safe4337ModuleAddress?: Address;
  };
}
```

CREATE2 地址，部署前即可算出。只支持 Safe 1.4.1 + EntryPoint 0.7、无 ERC-7579
launchpad、无 setupTransactions —— Semi 实际用的唯一组合。

⚠️ **`owners` 的顺序会改变结果**：它直接进 initializer，而 initializer 是 salt 的
原像。把 owner 当集合看待的调用方必须先排序。`semi-core/account` 的
`predictAddress` 已经替你排好了，直接用那个更安全。

`owners` 为空抛 `Error`。

### 编码

```ts
function encodeSafeInitializer(params: SafeInitializerParams): Hex
interface SafeInitializerParams {
  owners: Address[];
  threshold: bigint;
  safeModuleSetupAddress: Address;
  safe4337ModuleAddress: Address;
  multiSendAddress: Address;
}

function encodeMultiSend(
  txs: { to: Address; data: Hex; value: bigint; operation: 0 | 1 }[]
): Hex
```

⚠️ `encodeSafeInitializer` 产出的字节串决定 CREATE2 的 salt，**改这里等于换掉所有
用户的钱包**。

### 签名原像

```ts
const EIP712_SAFE_OPERATION_TYPE_V07  // SafeOp 的 EIP-712 类型定义

function packPaymasterAndData(fields: PaymasterFields): Hex
interface PaymasterFields {
  paymaster?: Address;
  paymasterVerificationGasLimit?: bigint;
  paymasterPostOpGasLimit?: bigint;
  paymasterData?: Hex;
}
```

`packPaymasterAndData` 把 v0.7 拆开的字段打包成 SafeOp 里那一个字节串：
`paymaster ‖ verificationGasLimit(16B) ‖ postOpGasLimit(16B) ‖ data`。
签名承诺的是打包形式，提交给 bundler 的是拆开的字段，**两者必须严格对应**。

⚠️ EIP-712 里字段的顺序和宽度是签名原像的一部分。`verificationGasLimit` /
`callGasLimit` 和 `maxPriorityFeePerGas` / `maxFeePerGas` 这两对的顺序**与 v0.6
相反**，且是 `uint128` 不是 `uint256`。

---

## `semi-core/account`

**唯一需要 `permissionless` 的入口**，因此不在主入口里。

```ts
function getSafeAccount(ctx, params: GetSafeAccountParams): Promise<SafeSmartAccount>
interface GetSafeAccountParams {
  privateKey: Hex;
  owners?: Address[];     // 多签必须传全部 owner，否则复原出的 initCode 对不上
  threshold?: number;
}

function getVirtualSafeAccount(ctx, params: GetVirtualSafeAccountParams): Promise<SafeSmartAccount>
interface GetVirtualSafeAccountParams {
  address: Address;
  owners?: Address[];
  threshold?: number;
  ownerCount?: number;    // 不知道具体地址、只需要个数时用（估 gas）
}

function predictAddress(ctx, params: PredictAddressParams): Promise<Address>
interface PredictAddressParams {
  owner?: Address;        // 单签的简写
  owners?: Address[];
  threshold?: number;
  saltNonce?: bigint;
}
```

`getSafeAccount` 是可签名的账户，签名者是 `privateKey` 对应的 EOA。

`getVirtualSafeAccount` 是只读的，没有真实私钥，**不能签名**，只用来估 gas。
多签场景必须传真实 `owners`：initCode 由 owner 列表算出，传错了估出来的 gas
就不是这个账户的。

`predictAddress` 会先对 owner 排序再算 —— 顺序影响结果，而调用方通常把 owner
当集合看待。有测试断言这三个入口对任意输入顺序给出同一地址。

---

## `semi-core/token`

只读，全部联网。

```ts
function getNativeBalance(ctx, address: Address): Promise<bigint>
function getErc20Balance(ctx, address: Address, token: Address): Promise<bigint>
function getErc20Balances(ctx, address: Address, tokens: Address[]): Promise<Erc20BalanceResult[]>
function getErc20Decimals(ctx, token: Address): Promise<number>
function isDeployed(ctx, address: Address): Promise<boolean>

interface Erc20BalanceResult {
  token: Address;
  balance: bigint;
  ok: boolean;   // false = 这个 token 的 balanceOf 失败，balance 是兜底的 0n
}
```

`getErc20Balances` 走一次 multicall3 读完，不是每个 token 一次 `eth_call`。
`allowFailure` 打开：单个坏 token（自毁的、不标准的）不该让整张余额列表崩掉，
它只读成 `0n` 并把 `ok` 标为 `false`，**要不要提示由调用方决定**。

只收地址、只回地址和余额 —— symbol / icon / decimals 这类元数据属于业务层，
不进这个包。

`isDeployed` 用来判断 Safe 是否还停在预测地址上（未部署时地址上没有字节码）。

---

## `semi-core/ops`

单签链上写操作的出口。需要 `bundlerUrl`。

### 提交 UserOperation

```ts
function sendUserOperation(ctx, params: SendUserOperationParams): Promise<UserOperationReceipt>
interface SendUserOperationParams {
  privateKey: Hex;
  calls: Call[];
  sponsorFee?: boolean;   // 默认 false。该链没配 paymaster 时抛错，不静默降级
  owners?: Address[];     // 多签钱包必须传
  threshold?: number;
}

type Call = Record<string, unknown>;  // 原始 to/value/data，或 abi + args
```

组装、估算、签名、提交、等回执。**所有单签链上写操作的唯一出口** —— 转账、部署
都走它，区别只在 `calls`。

### 转账

```ts
function sendNativeTransfer(ctx, params: TransferParams): Promise<UserOperationReceipt>
function sendErc20Transfer(ctx, params: Erc20TransferParams): Promise<UserOperationReceipt>

interface TransferParams {
  privateKey: Hex;
  to: Address;
  amount: bigint;         // 最小单位：原生币是 wei，ERC20 是 10^decimals 的整数倍
  sponsorFee?: boolean;
  extraCalls?: Call[];    // 打包进同一笔 UserOp 的额外调用（比如备注上链）
}
interface Erc20TransferParams extends TransferParams {
  token: Address;
}
```

⚠️ `amount` 收 `bigint` 的**最小单位**。单位换算交给调用方（viem 的
`parseUnits`）—— 早先这里收字符串再按 `BigInt(Number(amount) * 10 ** decimals)`
换算，经过一次 float64，18 位小数的大额会静默丢精度。

### gas

```ts
function getUserOperationGasPrice(ctx): Promise<GasPrice>
interface GasPrice { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }

function estimateMultisigGas(ctx, bundlerClient, params: EstimateMultisigGasParams): Promise<GasEstimate>
interface GasEstimate extends GasPrice {
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
}

const multisigVerificationGasLimit: (threshold: number) => bigint  // 每多一个签名者 +60k
const VERIFICATION_GAS_FLOOR = 600_000n
```

`getUserOperationGasPrice` **优先问 bundler**：它给的是它自己愿意接受的价格。链上
baseFee 只是链的状态，两者可以差很远，按后者出价会被 bundler 拒收。问不到就退回
链上 EIP-1559 估价并记 warning —— 出一个可能被拒的价格，好过让交易根本发不出去。

`VERIFICATION_GAS_FLOOR` 是**下限**不是覆盖值：bundler 估得更大就用估算值。低估
会在链上以 AA23 失败，高估的部分 EntryPoint 会退回，代价不对称。

`estimateMultisigGas` 估不出来时（账户未部署、签名占位不被接受）退回一组保守默认
值，不抛错 —— 多签流程里估算失败不该阻断提案，收齐签名前还有机会重建快照。

没配 bundler 抛 `GasEstimationError`。

`sendUserOperation` 另外会抛 `InsufficientFundsError`（自付 gas 但余额不够预付）
和 `UserOpFailedError`。

⚠️ **上链 ≠ 成功。** EntryPoint 会 catch 住内层调用的 revert：那笔 handleOps 交易本身
是成功的（回执 status `0x1`，也有 transactionHash），只是 UserOperationEvent 里的
`success` 是 false。`sendUserOperation` 和 `executeMultisigUserOp` 都会检查这一位，
false 时抛 `UserOpFailedError` 并带上 `txHash` / `userOpHash` —— **有 `txHash` 就意味着
已经上链、nonce 已消耗**，这笔不能重发，必须重新构造。bundler 不返回 `success` 字段时
无从判断，不当作失败。

---

## `semi-core/multisig`

### 快照（跨进程契约）

```ts
function buildMultisigUserOpSnapshot(ctx, params: BuildSnapshotParams): Promise<UserOpSnapshot>
interface BuildSnapshotParams {
  safeAddress: Address;
  owners: Address[];
  threshold: number;
  calls: { to: Address; value?: bigint; data?: Hex }[];
  forcedNonce?: bigint;   // 拒签替换：沿用被替换交易的 nonce
  sponsorFee?: boolean;   // 默认 true。没配 paymaster 或申请失败时自动退回自付
}

const SNAPSHOT_VALIDITY_SECONDS = 14 * 24 * 60 * 60   // 14 天
function assertValidSnapshot(snapshot: unknown): asserts snapshot is UserOpSnapshot
```

由**第一个签名者**触发。gas 和 paymaster 数据在这一刻冻结 —— 它们都进 SafeOp 的
EIP-712 哈希，之后任何一个字节的变化都会让已收集的签名作废。

`UserOpSnapshot` 序列化进后端数据库、再取回来给下一个签名者用，是**跨进程契约**：
数值一律用字符串存（JSON 没有 bigint），**字段名和形状不能随意改**。

```ts
interface UserOpSnapshot {
  sender: Address;
  nonce: string;
  callData: Hex;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  verificationGasLimit: string;
  callGasLimit: string;
  preVerificationGas: string;
  validAfter: number;
  validUntil: number;
  factory?: Address;
  factoryData?: Hex;
  initCode: Hex;
  chainId: number;
  safeOpHash?: Hex;            // 全部被签字段的指纹，建快照时算好；旧快照没有 = 跳过检查
  expiresAt?: number;          // Semi 自己的收签窗口；旧快照没有此字段 = 不过期

  // paymaster 赞助，建快照时冻结。所有 owner 必须对同一份数据签名
  paymasterAndData?: Hex;      // 进 EIP-712 哈希的**打包**形式
  paymaster?: Address;         // 以下是提交给 bundler 的 v0.7 **拆开**形式
  paymasterData?: Hex;
  paymasterVerificationGasLimit?: string;
  paymasterPostOpGasLimit?: string;
  sponsored?: boolean;         // true = paymaster 代付
  paymasterValidUntil?: number; // 0 = 不过期
}
```

**从后端取回的快照，签名前先过 `assertValidSnapshot`。** 往返中丢字段不会立刻
报错 —— 它会一路走到签名，算出一个看起来正常、实则错误的哈希，最后在链上
`checkSignatures` 处 revert，而那已经是收齐所有签名之后。缺字段抛 `Error`。

`SNAPSHOT_VALIDITY_SECONDS` 是 **Semi 自己的策略限制**，与 paymaster 无关（实测
ZeroDev 的 `validUntil` 是 0，赞助本身不过期）。加它是因为快照冻结了 nonce 和 gas
价格：放得越久，nonce 越可能被别的交易占用（提交时 AA25），冻结的价格也越可能低于
行情而被拒收。改这个值只影响此后新建的提案 —— 已存在的快照按写入时记下的
`expiresAt` 判定，因为签名承诺的是那一份快照。

### 签名

```ts
function safeOpHash(snapshot: UserOpSnapshot): Hex

function signSafeOpSnapshot(
  privateKey: Hex,
  snapshot: UserOpSnapshot,
  options?: SignSnapshotOptions
): Promise<CollectedSignature>
interface SignSnapshotOptions { expectedHash?: Hex }
interface CollectedSignature { signer_address: Address; signature: Hex }

function packMultisigSignatures(
  signatures: CollectedSignature[],
  threshold: number,
  validAfter?: number,   // 默认 0
  validUntil?: number    // 默认 0
): Hex

function signedBy(signatures: CollectedSignature[]): Set<string>   // 小写地址
function remainingSigners(owners: Address[], signatures: CollectedSignature[]): Address[]
```

`signSafeOpSnapshot` **不联网、不需要 bundler** —— 每个 owner 可以独立完成，这正是
多签能异步收签的原因。

签名前会重算 SafeOp 哈希并比对，不一致抛 `SnapshotHashMismatchError`：

- 和快照自带的 `safeOpHash` 比 —— 这只能发现**意外**损坏（传输、序列化丢字段）。
  协调层要是能改快照，同样能改这个字段。
- 和 `options.expectedHash` 比 —— **这才是真正的防篡改检查**，那份哈希必须从另一条渠道
  来（提案时展示给用户的、链接里带的、本地留存的）。

`safeOpHash(snapshot)` 是快照全部被签字段的指纹：改动任何一个被签字段哈希都变，而
`expiresAt` / `sponsored` / `paymasterValidUntil` 这些不进签名的字段不影响它。
`executeMultisigUserOp` 提交前也会做同样的自洽比对。

⚠️ `packMultisigSignatures` **按签名者地址升序排列是强制的**：Safe 的
`checkSignatures` 依赖这个顺序线性扫描 owner 链表，顺序错了会判定为无效签名。
多收的签名按序取前 `threshold` 个。

### 执行

```ts
function executeMultisigUserOp(
  ctx,
  snapshot: UserOpSnapshot,
  signatures: CollectedSignature[],
  threshold: number,
  options?: { maxAttempts?: number; intervalMs?: number }
): Promise<ExecuteResult>

interface ExecuteResult {
  userOpHash: Hex;
  txHash: Hex;
  actualGasCost: bigint;   // paymaster 实际付掉的 wei，后端据此给执行者记账
}
```

走原始 RPC 而非 viem 的 `sendUserOperation`：签名是外部收集好的，不需要也不能让
客户端再签一次。

`options` 是等回执的轮询参数，默认 `maxAttempts: 60` / `intervalMs: 3000`（共 3 分钟）。

两道过期检查各查各的，报不同的错：`SnapshotExpiredError`（Semi 的收签窗口）和
`PaymasterExpiredError`（paymaster 签名的有效期）。其余失败一律是 `BundlerError`
——没配 bundler、bundler 拒收（带 `aaCode`）、等回执超时。超时的 message 会提示
「这笔可能仍会上链，重新提案前先查 bundler」。

### owner 管理

```ts
function encodeAddOwner(newOwner: Address, newThreshold: number): Hex
function encodeRemoveOwner(prevOwner: Address, owner: Address, newThreshold: number): Hex
function encodeChangeThreshold(newThreshold: number): Hex
function encodeSwapOwner(prevOwner: Address, oldOwner: Address, newOwner: Address): Hex

function getSafeOwners(ctx, safeAddress: Address): Promise<SafeOwners>
interface SafeOwners {
  owners: Address[];       // 链上链表顺序，不是任意顺序
  threshold: number;
  getPrevOwner: (owner: Address) => Address;
}

function getActualGasFee(ctx, txHash: Hex): Promise<bigint | null>  // 找不到回执返回 null
```

⚠️ `prevOwner` 是链表中指向 `owner` 的那一个，owner 在表头时是 `SENTINEL_OWNERS`
（`0x1`）。**用 `getSafeOwners` 返回的 `getPrevOwner` 取，不要自己猜** —— 顺序是
链上的，不一定和你手里的列表一致。四个 `encode*` 只是纯编码，不校验任何东西；
传了非 owner 的地址是 `getPrevOwner` 抛 `Error`。

`getSafeOwners` 会先查字节码：Safe 可能还停在预测地址上没部署，那时合约调用返回
`"0x"`，会被误读成空列表。未部署抛 `SafeNotDeployedError`。

### 赞助

```ts
function fetchSponsorPaymasterData(ctx, userOp: SponsorshipUserOp): Promise<SponsorPaymasterFields | null>
function parsePaymasterValidity(paymasterData: Hex): PaymasterValidity | null

interface SponsorPaymasterFields {
  paymaster: Address;
  paymasterData: Hex;
  paymasterVerificationGasLimit: bigint;
  paymasterPostOpGasLimit: bigint;
  validUntil: number;   // 0 = 不过期，或布局不认识、无从判断
}
interface PaymasterValidity { validUntil: number; validAfter: number }
```

`fetchSponsorPaymasterData` 走 ERC-7677 `pm_getPaymasterData`。该链没配 paymaster
返回 `null`；RPC 失败则抛错，**由调用方决定是否退回自付**。

`parsePaymasterValidity` 布局不认识时返回 `null`，调用方**不要**退回一个猜出来的
期限：误判过期的代价（丢掉已收集的全部签名）远大于漏判（提交后拿到一个说得清原因
的 AA33）。这里以前写死「7 天」猜测，而实测的 `validUntil` 是 0，那个假期限会在第
8 天拒掉一笔完全有效的交易。

---

## 错误

全部继承 `SemiCoreError`（`extends Error`，带 `code: string`）。
**按 `code` 分支，不要匹配 message 文本。**

| 类                          | `code`                     | 何时抛 | 额外字段 |
| --------------------------- | -------------------------- | ------ | -------- |
| `ConfigError`               | `INVALID_CONFIG`           | `createSemiCore` 配置有问题，构造时即抛 | |
| `ChainNotConfiguredError`   | `CHAIN_NOT_CONFIGURED`     | `core.chain(id)` 取了没配置的链 | `chainId` |
| `ChainMismatchError`        | `CHAIN_MISMATCH`           | RPC 实际连着的链和配置的 `chain.id` 不一致 | `configured`, `actual` |
| `SnapshotHashMismatchError` | `SNAPSHOT_HASH_MISMATCH`   | 快照的 SafeOp 哈希和记录在案的对不上 | `expected`, `actual` |
| `KeystoreError`             | `KEYSTORE_BAD_PASSCODE`    | 口令错 | |
| `KeystoreError`             | `KEYSTORE_MALFORMED`       | keystore 结构坏了 | |
| `PaymasterNotConfiguredError` | `PAYMASTER_NOT_CONFIGURED` | 要求代付但该链没配 paymaster | |
| `GasEstimationError`        | `GAS_ESTIMATION_FAILED`    | 没配 bundler，或 bundler 估算失败 | |
| `InsufficientFundsError`    | `INSUFFICIENT_FUNDS`       | 自付 gas 但余额不够预付 | `balance`, `required` |
| `BundlerError`              | `BUNDLER_REJECTED`         | bundler 拒收 | `aaCode` |
| `UserOpFailedError`         | `USER_OP_FAILED`           | 提交后链上失败 | `aaCode` |
| `PaymasterExpiredError`     | `PAYMASTER_EXPIRED`        | paymaster 赞助已过期（技术限制） | `expiredAt` |
| `SnapshotExpiredError`      | `SNAPSHOT_EXPIRED`         | 提案超过收签窗口（Semi 的策略限制） | `expiredAt` |
| `SafeNotDeployedError`      | `SAFE_NOT_DEPLOYED`        | Safe 还停在预测地址上，读不了 owner | `address` |

`PaymasterExpiredError` 和 `SnapshotExpiredError` 是两回事，分开就是为了排查时不会
看错原因。两者的处置相同：**必须重新发起提案**，已收集的签名作废。

`aaCode` 是 ERC-4337 的错误码（`AA23` 验签失败、`AA25` nonce 已被占用、`AA33`
paymaster 拒绝等）。

---

## 常见流程

**单签转账**

```ts
const ctx = core.chain(chainId);
const privateKey = await keystoreToPrivateKey(keystore, passcode);
const receipt = await sendErc20Transfer(ctx, {
  privateKey,
  token,
  to,
  amount: parseUnits(input, await getErc20Decimals(ctx, token)),
  sponsorFee: ctx.canSponsorGas,
});
```

**多签：提案 → 收签 → 执行**

```ts
// 1. 提案（第一个签名者）——冻结 nonce、gas、paymaster
const snapshot = await buildMultisigUserOpSnapshot(ctx, {
  safeAddress, owners, threshold, calls,
});
const first = await signSafeOpSnapshot(privateKey, snapshot);
// 快照与签名存到后端

// 2. 后续签名者（可以离线，不需要 bundler）
assertValidSnapshot(snapshotFromBackend);
const sig = await signSafeOpSnapshot(privateKey, snapshotFromBackend, {
  expectedHash, // 从另一条渠道拿到的提案哈希；没有就退化成只查自洽
});
// 还差谁：remainingSigners(owners, collected)

// 3. 收齐后执行
const { txHash, actualGasCost } = await executeMultisigUserOp(
  ctx, snapshot, collected, threshold
);
```

**改 owner**

```ts
const { getPrevOwner } = await getSafeOwners(ctx, safeAddress);
const calls = [{ to: safeAddress, data: encodeRemoveOwner(getPrevOwner(target), target, 2) }];
// 之后走上面的多签流程
```
