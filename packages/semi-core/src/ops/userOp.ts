import { erc20Abi, http, type Address, type Hex } from "viem";
import {
  createBundlerClient,
  createPaymasterClient,
  type UserOperationReceipt,
} from "viem/account-abstraction";
import type { ChainContext } from "../config";
import {
  GasEstimationError,
  InsufficientFundsError,
  PaymasterNotConfiguredError,
  UserOpFailedError,
} from "../errors";
import { getSafeAccount } from "../account";
import { getUserOperationGasPrice, VERIFICATION_GAS_FLOOR, type GasEstimate } from "./gas";

/** 一次 UserOp 里的一笔调用。可以是原始 to/value/data，也可以是 abi + args。 */
export type Call = Record<string, unknown>;

export interface SendUserOperationParams {
  privateKey: Hex;
  calls: Call[];
  /** 是否请求 paymaster 代付。该链没配 paymaster 时抛错，不静默降级。 */
  sponsorFee?: boolean;
  /** 多签钱包必须传，否则复原出的 initCode 对不上 */
  owners?: Address[];
  threshold?: number;
}

/**
 * bundler 客户端里我们实际用到的部分。
 *
 * viem 的 BundlerClient 泛型会把 account / calls 的类型收窄到具体的
 * SmartAccount 实现上，而我们要接受任何 Safe 账户和任意 calls。与其在每个
 * 调用点上撒 `as never`，不如在这里声明清楚需要什么，转换只发生在创建处。
 */
interface MinimalBundlerClient {
  estimateUserOperationGas(args: Record<string, unknown>): Promise<{
    callGasLimit: bigint;
    verificationGasLimit: bigint;
    preVerificationGas: bigint;
  }>;
  sendUserOperation(args: Record<string, unknown>): Promise<Hex>;
  waitForUserOperationReceipt(args: { hash: Hex }): Promise<UserOperationReceipt>;
}

function bundlerFor(ctx: ChainContext, sponsorFee: boolean) {
  if (!ctx.bundlerUrl) {
    throw new GasEstimationError(`No bundler configured for chain ${ctx.chainId}`);
  }
  if (sponsorFee && !ctx.canSponsorGas) {
    // 快速失败：否则 UI 以为走了代付，发出去的却是自付的 userOp
    throw new PaymasterNotConfiguredError(ctx.chainId);
  }
  const paymasterClient =
    sponsorFee && ctx.paymasterUrl
      ? createPaymasterClient({ transport: http(ctx.paymasterUrl) })
      : undefined;
  const bundlerClient = createBundlerClient({
    chain: ctx.chain,
    transport: http(ctx.bundlerUrl),
    paymaster: paymasterClient,
  }) as unknown as MinimalBundlerClient;
  return { bundlerClient, paymasterClient };
}

async function estimate(
  ctx: ChainContext,
  bundlerClient: MinimalBundlerClient,
  account: unknown,
  calls: Call[]
): Promise<GasEstimate> {
  const gasPrice = await getUserOperationGasPrice(ctx);

  let gas: Awaited<ReturnType<MinimalBundlerClient["estimateUserOperationGas"]>>;
  try {
    gas = await bundlerClient.estimateUserOperationGas({
      account,
      calls,
      maxFeePerGas: gasPrice.maxFeePerGas,
      maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
    });
  } catch (cause) {
    throw new GasEstimationError(
      `Failed to estimate UserOperation gas: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      { cause }
    );
  }

  const verificationGasLimit =
    gas.verificationGasLimit > VERIFICATION_GAS_FLOOR
      ? gas.verificationGasLimit
      : VERIFICATION_GAS_FLOOR;

  ctx.logger.debug("UserOperation gas estimate", { ...gasPrice, ...gas, verificationGasLimit });
  return { ...gasPrice, ...gas, verificationGasLimit };
}

/** 自付 gas 时，账户里得有足够的 ETH 预付，否则给个说得清的错误 */
async function assertCanPrefund(ctx: ChainContext, address: Address, gas: GasEstimate) {
  const balance = await ctx.publicClient.getBalance({ address });
  const totalGas = gas.callGasLimit + gas.verificationGasLimit + gas.preVerificationGas + 50_000n; // 余量
  const required = totalGas * gas.maxFeePerGas;
  if (balance < required) throw new InsufficientFundsError(balance, required);
}

/** 账户没部署且没有 paymaster 时，userOp 无法自举 */
async function assertDeployedOrSponsored(ctx: ChainContext, address: Address) {
  const code = await ctx.publicClient.getCode({ address });
  if (!code || code === "0x") {
    throw new UserOpFailedError(
      `Smart account ${address} is not deployed on chain ${ctx.chainId} and gas sponsorship is off, so it cannot pay for its own deployment.`
    );
  }
}

/**
 * 组装、估算、签名并提交一笔 UserOp，等回执。
 *
 * 这里是所有单签链上写操作的唯一出口——转账、部署都走它，只是 calls 不同。
 */
export async function sendUserOperation(
  ctx: ChainContext,
  { privateKey, calls, sponsorFee = false, owners, threshold }: SendUserOperationParams
): Promise<UserOperationReceipt> {
  const account = await getSafeAccount(ctx, { privateKey, owners, threshold });
  const { bundlerClient, paymasterClient } = bundlerFor(ctx, sponsorFee);

  const gas = await estimate(ctx, bundlerClient, account, calls);

  if (!sponsorFee) {
    await assertDeployedOrSponsored(ctx, account.address);
    await assertCanPrefund(ctx, account.address, gas);
  }

  try {
    const hash = await bundlerClient.sendUserOperation({
      account,
      calls,
      ...gas,
      ...(paymasterClient ? { paymaster: paymasterClient } : {}),
    });
    ctx.logger.debug("UserOperation submitted", { hash });
    return await bundlerClient.waitForUserOperationReceipt({ hash });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    const aaCode = message.match(/\bAA\d{2}\b/)?.[0];
    throw new UserOpFailedError(
      aaCode === "AA23"
        ? `${message} — AA23 means the account's validateUserOp reverted: wrong owner key, wrong chain, nonce mismatch, or not enough ETH to prefund without a paymaster.`
        : message,
      aaCode,
      { cause }
    );
  }
}

export interface TransferParams {
  privateKey: Hex;
  to: Address;
  /** **最小单位**。原生币是 wei，ERC20 是 10^decimals 的整数倍。 */
  amount: bigint;
  sponsorFee?: boolean;
  /** 和转账打包进同一笔 UserOp 的额外调用（比如备注上链） */
  extraCalls?: Call[];
}

export function sendNativeTransfer(
  ctx: ChainContext,
  { to, amount, extraCalls = [], ...rest }: TransferParams
) {
  return sendUserOperation(ctx, { ...rest, calls: [{ to, value: amount }, ...extraCalls] });
}

export interface Erc20TransferParams extends TransferParams {
  token: Address;
}

/**
 * ERC20 转账。
 *
 * `amount` 收最小单位的 bigint。原来这里收的是字符串，内部按
 * `BigInt(Number(amount) * 10 ** decimals)` 换算——经过一次 float64，
 * 18 位小数的大额会静默丢精度。单位换算交给调用方（viem 的 parseUnits）。
 */
export function sendErc20Transfer(
  ctx: ChainContext,
  { to, token, amount, extraCalls = [], ...rest }: Erc20TransferParams
) {
  return sendUserOperation(ctx, {
    ...rest,
    calls: [
      { abi: erc20Abi, functionName: "transfer", args: [to, amount], to: token },
      ...extraCalls,
    ],
  });
}
