import { concatHex, http, type Address, type Hex } from "viem";
import { createBundlerClient } from "viem/account-abstraction";
import { getVirtualSafeAccount } from "../account";
import type { ChainContext } from "../config";
import { GasEstimationError } from "../errors";
import { estimateMultisigGas } from "../ops";
import { packPaymasterAndData } from "../safe";
import { isDeployed } from "../token";
import { fetchSponsorPaymasterData } from "./sponsorship";
import type { UserOpSnapshot } from "./types";

export interface BuildSnapshotParams {
  safeAddress: Address;
  owners: Address[];
  threshold: number;
  calls: { to: Address; value?: bigint; data?: Hex }[];
  /** 拒签替换：沿用被替换交易的 nonce */
  forcedNonce?: bigint;
  /** 默认 true。该链没配 paymaster 或申请失败时自动退回自付。 */
  sponsorFee?: boolean;
}

/** 多签的安全余量：验签 1.5 倍，其余 1.2 倍 */
const VERIFICATION_BUFFER = { num: 3n, den: 2n };
const OTHER_BUFFER = { num: 6n, den: 5n };

/**
 * 建立并锁定所有签名者共同承诺的 UserOp 快照。
 *
 * 由第一个签名者触发。gas 和 paymaster 数据都在这一刻冻结——因为它们都进
 * SafeOp 的 EIP-712 哈希，之后任何一个字节的变化都会让已收集的签名作废。
 */
export async function buildMultisigUserOpSnapshot(
  ctx: ChainContext,
  { safeAddress, owners, threshold, calls, forcedNonce, sponsorFee = true }: BuildSnapshotParams
): Promise<UserOpSnapshot> {
  if (!ctx.bundlerUrl) {
    throw new GasEstimationError(`No bundler configured for chain ${ctx.chainId}`);
  }

  const account = await getVirtualSafeAccount(ctx, { address: safeAddress, owners, threshold });
  const bundlerClient = createBundlerClient({
    chain: ctx.chain,
    transport: http(ctx.bundlerUrl),
  }) as unknown as Parameters<typeof estimateMultisigGas>[1];

  const callData = (await account.encodeCalls(
    calls.map((c) => ({ to: c.to, value: c.value ?? 0n, data: c.data ?? "0x" }))
  )) as Hex;

  const nonce = forcedNonce ?? (await account.getNonce());

  const rawGas = await estimateMultisigGas(ctx, bundlerClient, { account, calls, threshold });

  const verificationGasLimit =
    (rawGas.verificationGasLimit * VERIFICATION_BUFFER.num) / VERIFICATION_BUFFER.den;
  const callGasLimit = (rawGas.callGasLimit * OTHER_BUFFER.num) / OTHER_BUFFER.den;
  const preVerificationGas = (rawGas.preVerificationGas * OTHER_BUFFER.num) / OTHER_BUFFER.den;

  // 未部署的 Safe 要带上 initCode，让这笔 UserOp 顺带把它部署出来
  let factory: Address | undefined;
  let factoryData: Hex | undefined;
  let initCode: Hex = "0x";
  if (!(await isDeployed(ctx, safeAddress))) {
    const args = await account.getFactoryArgs();
    factory = args.factory as Address;
    factoryData = args.factoryData as Hex;
    initCode = concatHex([factory, factoryData]);
  }

  let paymasterAndData: Hex = "0x";
  let paymaster: Address | undefined;
  let paymasterData: Hex | undefined;
  let paymasterVerificationGasLimit: string | undefined;
  let paymasterPostOpGasLimit: string | undefined;
  let sponsored = false;
  let paymasterValidUntil = 0;

  if (sponsorFee && ctx.canSponsorGas) {
    try {
      const pm = await fetchSponsorPaymasterData(ctx, {
        sender: safeAddress,
        nonce,
        callData,
        callGasLimit,
        verificationGasLimit,
        preVerificationGas,
        maxFeePerGas: rawGas.maxFeePerGas,
        maxPriorityFeePerGas: rawGas.maxPriorityFeePerGas,
        factory,
        factoryData,
      });
      if (pm) {
        paymaster = pm.paymaster;
        paymasterData = pm.paymasterData;
        paymasterVerificationGasLimit = pm.paymasterVerificationGasLimit.toString();
        paymasterPostOpGasLimit = pm.paymasterPostOpGasLimit.toString();
        // 签名承诺的是打包形式，提交给 bundler 的是拆开形式，两者必须对应
        paymasterAndData = packPaymasterAndData(pm);
        sponsored = true;
        paymasterValidUntil = pm.validUntil;
      }
    } catch (error) {
      // 赞助失败不该阻断提案——退回自付即可
      ctx.logger.warn("Paymaster sponsorship failed, falling back to self-pay", error);
    }
  }

  return {
    sender: safeAddress,
    nonce: nonce.toString(),
    callData,
    maxFeePerGas: rawGas.maxFeePerGas.toString(),
    maxPriorityFeePerGas: rawGas.maxPriorityFeePerGas.toString(),
    verificationGasLimit: verificationGasLimit.toString(),
    callGasLimit: callGasLimit.toString(),
    preVerificationGas: preVerificationGas.toString(),
    validAfter: 0,
    validUntil: 0,
    factory,
    factoryData,
    initCode,
    chainId: ctx.chainId,
    paymasterAndData,
    paymaster,
    paymasterData,
    paymasterVerificationGasLimit,
    paymasterPostOpGasLimit,
    sponsored,
    paymasterValidUntil,
  };
}
