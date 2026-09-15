import { beforeAll, describe, expect, it } from "vitest";
import {
  concat,
  concatHex,
  createPublicClient,
  createWalletClient,
  encodePacked,
  http,
  pad,
  parseEther,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum, optimism } from "viem/chains";
import { entryPoint07Abi, entryPoint07Address } from "viem/account-abstraction";
import {
  createSemiCore,
  SAFE_4337_MODULE_ADDRESS,
  EIP712_SAFE_OPERATION_TYPE_V07,
} from "../../src/index";
import { getSafeAccount, predictAddress } from "../../src/account";
import { encodeRemoveOwner, packMultisigSignatures } from "../../src/multisig";

const RPC = process.env.ANVIL_RPC;
/** 被 fork 的链：FORK_CHAIN_ID=42161 测 Arbitrum，默认 Optimism */
const CHAIN = process.env.FORK_CHAIN_ID === "42161" ? arbitrum : optimism;

/** anvil 的默认账户：一个出资部署，一个扮演 bundler 调 handleOps */
const FUNDER = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
);
const BUNDLER = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
);

const RECIPIENT: Address = "0x000000000000000000000000000000000000dEaD";
const ownerKey = (i: number): Hex => `0x${(i + 1).toString(16).padStart(64, "0")}`;

const safeReadAbi = [
  {
    name: "getOwners",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address[]" }],
  },
  {
    name: "getThreshold",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "isModuleEnabled",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "m", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    name: "VERSION",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
] as const;

/** v0.7 把两个 gas limit 塞进一个 bytes32 */
const packGas = (hi: bigint, lo: bigint): Hex =>
  concat([pad(toHex(hi), { size: 16 }), pad(toHex(lo), { size: 16 })]);

describe.skipIf(!RPC)("fork 上的部署与执行", () => {
  const core = createSemiCore({
    chains: [{ chain: CHAIN, rpcUrl: RPC ?? "http://127.0.0.1:8545" }],
  });
  const ctx = core.chain(CHAIN.id);
  const pub = createPublicClient({ chain: CHAIN, transport: http(RPC) });
  const funder = createWalletClient({ account: FUNDER, chain: CHAIN, transport: http(RPC) });
  const bundler = createWalletClient({ account: BUNDLER, chain: CHAIN, transport: http(RPC) });

  beforeAll(async () => {
    // fork 的链必须与 FORK_CHAIN_ID 一致，否则下面的地址和签名域都对不上
    expect(await pub.getChainId()).toBe(CHAIN.id);
    for (const addr of [
      "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67", // ProxyFactory
      "0x41675C099F32341bf84BFc5382aF534df5C7461a", // Safe singleton
      SAFE_4337_MODULE_ADDRESS,
      entryPoint07Address,
    ] as Address[]) {
      const code = await pub.getCode({ address: addr });
      expect(code, `${addr} 上没有合约代码，fork 不对`).toBeTruthy();
    }
  }, 60_000);

  const cases = [
    { name: "单签 1-of-1", n: 1, threshold: 1 },
    { name: "多签 2-of-2", n: 2, threshold: 2 },
    { name: "多签 2-of-3", n: 3, threshold: 2 },
    { name: "多签 3-of-5", n: 5, threshold: 3 },
  ];

  for (const c of cases) {
    it(`${c.name}：预测地址 = 实际部署地址，UserOp 经 EntryPoint 执行成功`, async () => {
      const signers = Array.from({ length: c.n }, (_, i) => privateKeyToAccount(ownerKey(i)));
      const owners = signers.map((s) => s.address);

      const predicted = await predictAddress(ctx, { owners, threshold: c.threshold });
      const account = await getSafeAccount(ctx, {
        privateKey: ownerKey(0),
        owners,
        threshold: c.threshold,
      });
      expect(account.address).toBe(predicted);

      // Safe 要能自付 gas，也要有钱可转
      await pub.waitForTransactionReceipt({
        hash: await funder.sendTransaction({ to: predicted, value: parseEther("1") }),
      });

      const amount = parseEther("0.01");
      const before = await pub.getBalance({ address: RECIPIENT });

      const callData = (await account.encodeCalls([
        { to: RECIPIENT, value: amount, data: "0x" },
      ])) as Hex;
      const nonce = await account.getNonce();
      const { factory, factoryData } = await account.getFactoryArgs();
      const initCode: Hex =
        factory && factoryData ? concatHex([factory as Hex, factoryData as Hex]) : "0x";

      const block = await pub.getBlock();
      const maxFeePerGas = (block.baseFeePerGas ?? 1_000_000n) * 2n + 1_000_000n;
      const maxPriorityFeePerGas = 1_000_000n;
      const verificationGasLimit = BigInt(600_000 + Math.max(0, c.threshold - 1) * 60_000);
      const callGasLimit = 300_000n;
      const preVerificationGas = 100_000n;

      // 每个 owner 独立签 SafeOp —— 与 signSafeOpSnapshot 走同一份类型定义
      const message = {
        safe: predicted,
        callData,
        nonce,
        initCode,
        maxFeePerGas,
        maxPriorityFeePerGas,
        preVerificationGas,
        verificationGasLimit,
        callGasLimit,
        paymasterAndData: "0x" as Hex,
        validAfter: 0,
        validUntil: 0,
        entryPoint: entryPoint07Address,
      };
      const collected = [];
      for (const s of signers.slice(0, c.threshold)) {
        collected.push({
          signer_address: s.address,
          signature: await s.signTypedData({
            domain: { chainId: CHAIN.id, verifyingContract: SAFE_4337_MODULE_ADDRESS },
            types: EIP712_SAFE_OPERATION_TYPE_V07,
            primaryType: "SafeOp",
            message,
          }),
        });
      }

      const hash = await bundler.writeContract({
        address: entryPoint07Address,
        abi: entryPoint07Abi,
        functionName: "handleOps",
        args: [
          [
            {
              sender: predicted,
              nonce,
              initCode,
              callData,
              accountGasLimits: packGas(verificationGasLimit, callGasLimit),
              preVerificationGas,
              gasFees: packGas(maxPriorityFeePerGas, maxFeePerGas),
              paymasterAndData: "0x",
              signature: packMultisigSignatures(collected, c.threshold),
            },
          ],
          BUNDLER.address,
        ],
      });
      const receipt = await pub.waitForTransactionReceipt({ hash });
      expect(receipt.status).toBe("success");

      // Safe 由 initCode 部署在预测的那个地址上
      const code = await pub.getCode({ address: predicted });
      expect(code).toBeTruthy();
      expect(code).not.toBe("0x");

      // 钱真的转出去了
      expect((await pub.getBalance({ address: RECIPIENT })) - before).toBe(amount);

      // 部署出来的 Safe 状态正确
      const [onOwners, onThreshold, moduleOn, version] = await Promise.all([
        pub.readContract({ address: predicted, abi: safeReadAbi, functionName: "getOwners" }),
        pub.readContract({ address: predicted, abi: safeReadAbi, functionName: "getThreshold" }),
        pub.readContract({
          address: predicted,
          abi: safeReadAbi,
          functionName: "isModuleEnabled",
          args: [SAFE_4337_MODULE_ADDRESS],
        }),
        pub.readContract({ address: predicted, abi: safeReadAbi, functionName: "VERSION" }),
      ]);
      expect([...onOwners].map((o) => o.toLowerCase()).sort()).toEqual(
        owners.map((o) => o.toLowerCase()).sort()
      );
      expect(Number(onThreshold)).toBe(c.threshold);
      expect(moduleOn).toBe(true);
      expect(version).toBe("1.4.1");
    }, 120_000);
  }

  // 多链多签：在一条还没部署的链上执行 owner 变更。第一笔 UserOp 用初始 owner
  // 部署，同时执行 removeOwner——prevOwner 按「排序后的初始 owner」推算，
  // 因为 Safe 按 initializer 里的顺序建 owner 链表，而 semi-core 会先排序。
  it("未部署的链上：部署与 removeOwner 在同一笔 UserOp 里完成，prevOwner 按排序后的初始 owner 推算", async () => {
    const signers = Array.from({ length: 3 }, (_, i) => privateKeyToAccount(ownerKey(20 + i)));
    const owners = signers.map((s) => s.address);
    const threshold = 2;
    const sorted = [...owners].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    const predicted = await predictAddress(ctx, { owners, threshold });
    const account = await getSafeAccount(ctx, { privateKey: ownerKey(20), owners, threshold });
    await pub.waitForTransactionReceipt({
      hash: await funder.sendTransaction({ to: predicted, value: parseEther("1") }),
    });

    // 移除排序后的第二个 owner，它的 prevOwner 是排序后的第一个
    const removed = sorted[1]!;
    const callData = (await account.encodeCalls([
      { to: predicted, value: 0n, data: encodeRemoveOwner(sorted[0]!, removed, 1) },
    ])) as Hex;
    const nonce = await account.getNonce();
    const { factory, factoryData } = await account.getFactoryArgs();
    const initCode = concatHex([factory as Hex, factoryData as Hex]);

    const block = await pub.getBlock();
    const maxFeePerGas = (block.baseFeePerGas ?? 1_000_000n) * 2n + 1_000_000n;
    const maxPriorityFeePerGas = 1_000_000n;
    const verificationGasLimit = 700_000n;
    const callGasLimit = 300_000n;
    const preVerificationGas = 100_000n;

    const message = {
      safe: predicted,
      callData,
      nonce,
      initCode,
      maxFeePerGas,
      maxPriorityFeePerGas,
      preVerificationGas,
      verificationGasLimit,
      callGasLimit,
      paymasterAndData: "0x" as Hex,
      validAfter: 0,
      validUntil: 0,
      entryPoint: entryPoint07Address,
    };
    const collected = [];
    for (const s of signers.slice(0, threshold)) {
      collected.push({
        signer_address: s.address,
        signature: await s.signTypedData({
          domain: { chainId: CHAIN.id, verifyingContract: SAFE_4337_MODULE_ADDRESS },
          types: EIP712_SAFE_OPERATION_TYPE_V07,
          primaryType: "SafeOp",
          message,
        }),
      });
    }

    const hash = await bundler.writeContract({
      address: entryPoint07Address,
      abi: entryPoint07Abi,
      functionName: "handleOps",
      args: [
        [
          {
            sender: predicted,
            nonce,
            initCode,
            callData,
            accountGasLimits: packGas(verificationGasLimit, callGasLimit),
            preVerificationGas,
            gasFees: packGas(maxPriorityFeePerGas, maxFeePerGas),
            paymasterAndData: "0x",
            signature: packMultisigSignatures(collected, threshold),
          },
        ],
        BUNDLER.address,
      ],
    });
    const receipt = await pub.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");

    const [onOwners, onThreshold] = await Promise.all([
      pub.readContract({ address: predicted, abi: safeReadAbi, functionName: "getOwners" }),
      pub.readContract({ address: predicted, abi: safeReadAbi, functionName: "getThreshold" }),
    ]);
    // removeOwner 成功才会少一个 owner：prevOwner 推错时它会 revert（GS205），
    // 而 EntryPoint 吞掉内层 revert，所以要看状态而不是看回执
    expect([...onOwners].map((o) => o.toLowerCase())).toEqual(
      sorted.filter((o) => o !== removed).map((o) => o.toLowerCase())
    );
    expect(Number(onThreshold)).toBe(1);
  }, 120_000);
});
