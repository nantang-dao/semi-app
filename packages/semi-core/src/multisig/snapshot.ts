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

/**
 * 提案的有效期：14 天。
 *
 * **这是 Semi 自己加的策略限制，不是 paymaster 的技术限制。**
 * 实测 ZeroDev 返回的 paymaster validUntil 是 0，赞助本身根本不过期
 * （见 parsePaymasterValidity）。两道检查在 executeMultisigUserOp 里
 * 各查各的，报的也是不同的错误。
 *
 * 加这道限制的理由和 paymaster 无关：快照把 nonce 和 gas 价格都冻结了。
 * 放得越久，nonce 越可能已经被别的交易占用（提交时报 AA25），冻结的
 * gas 价格也越可能低于当时的行情而被 bundler 拒收。与其让它在提交那一刻
 * 以难懂的方式失败，不如提前说清楚「这个提案太旧了，请重新发起」。
 *
 * 改动这个值只影响此后新建的提案。已经存在的快照按写入时记下的 expiresAt
 * 判定 —— 因为签名承诺的是那一份快照，不能事后改口。
 */
export const SNAPSHOT_VALIDITY_SECONDS = 14 * 24 * 60 * 60;

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
    expiresAt: Math.floor(Date.now() / 1000) + SNAPSHOT_VALIDITY_SECONDS,
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
