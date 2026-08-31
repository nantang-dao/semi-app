import { parseEther, parseUnits, type Address, type Chain } from "viem";
import type { UserOperationReceipt } from "viem/account-abstraction";
import { bytesToHex, toBytes } from "viem";
import {
  sendUserOperation,
  sendNativeTransfer,
  sendErc20Transfer,
  multisigVerificationGasLimit,
  type Call,
} from "semi-core/ops";
import { getErc20Decimals } from "semi-core/token";
import { chainContext } from "~/utils/semi_core";
import { CREATE_CALL_CONTRACT, TOKEN_FACTORY_CONTRACT } from "../config";
import CreateCallAbi from "../deploy/CreateCall.abi.json";
import { abi as tokenFactoryAbi } from "../deploy/MinimalFactory.json";

/** 交易回执。UI 读的是 receipt.receipt.transactionHash / actualGasCost / success。 */
export type TransactionReceipt = UserOperationReceipt;

export { multisigVerificationGasLimit };

export interface TransferOptions {
  to: Address;
  /** 用户输入的十进制字符串，如 "1.5" */
  amount: string;
  erc20TokenAddress?: Address;
  privateKey: `0x${string}`;
  chain: Chain;
  sponsorFee: boolean;
  /** 同一笔 UserOp 的额外 call（如 saveRemark） */
  optionalCalls?: Call[];
}

export const transfer = async ({
  to,
  amount,
  privateKey,
  chain,
  sponsorFee,
  optionalCalls,
}: TransferOptions): Promise<TransactionReceipt> =>
  sendNativeTransfer(chainContext(chain.id), {
    privateKey,
    to,
    amount: parseEther(amount),
    sponsorFee,
    extraCalls: optionalCalls,
  });

export const transferErc20 = async ({
  to,
  amount,
  privateKey,
  chain,
  erc20TokenAddress,
  sponsorFee,
  optionalCalls,
}: TransferOptions): Promise<TransactionReceipt> => {
  if (!erc20TokenAddress) throw new Error("ERC20 token address is required");

  const ctx = chainContext(chain.id);
  // decimals 以合约为准，不用后端元数据——两者不一致时转错的是真金白银
  const decimals = await getErc20Decimals(ctx, erc20TokenAddress);

  return sendErc20Transfer(ctx, {
    privateKey,
    to,
    token: erc20TokenAddress,
    // parseUnits 走字符串解析。原来是 BigInt(Number(amount) * 10 ** decimals)，
    // 经过 float64，18 位小数的大额会静默丢精度。
    amount: parseUnits(amount, decimals),
    sponsorFee,
    extraCalls: optionalCalls,
  });
};

export interface DeployOptions {
  privateKey: `0x${string}`;
  chain: Chain;
  callData: `0x${string}`;
  sponsorFee?: boolean;
}

/** 通过 Semi 自己部署的 CreateCall 合约做 CREATE2 部署 */
export const deploy = async ({
  privateKey,
  chain,
  callData,
  sponsorFee = false,
}: DeployOptions): Promise<TransactionReceipt> =>
  sendUserOperation(chainContext(chain.id), {
    privateKey,
    sponsorFee,
    calls: [
      {
        abi: CreateCallAbi,
        functionName: "performCreate2",
        args: ["0", callData, bytesToHex(toBytes(Date.now().toString()), { size: 32 })],
        to: CREATE_CALL_CONTRACT[chain.id],
      },
    ],
  });

export interface DeployTokenOptions {
  name: string;
  symbol: string;
  owner: Address;
  minter: Address;
  initMint?: string;
  maxSupply: string;
  privateKey: `0x${string}`;
  sponsorFee?: boolean;
  chain: Chain;
}

/** 通过 Semi 的 MinimalFactory 部署一个 ERC20 */
export const deployToken = async ({
  privateKey,
  chain,
  name,
  symbol,
  owner,
  minter,
  initMint,
  maxSupply,
  sponsorFee = false,
}: DeployTokenOptions): Promise<TransactionReceipt> => {
  const factory = TOKEN_FACTORY_CONTRACT[chain.id];
  if (!factory) throw new Error(`No token factory deployed on chain ${chain.id}`);

  return sendUserOperation(chainContext(chain.id), {
    privateKey,
    sponsorFee,
    calls: [
      {
        abi: tokenFactoryAbi,
        functionName: "createMinimal",
        args: [name, symbol, owner, minter, initMint, maxSupply],
        to: factory,
      },
    ],
  });
};
