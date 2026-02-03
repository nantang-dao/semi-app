import type { Address, Chain } from "viem";

import { prepareClient } from "./utils/prepareClient";
import { getSafeAccount, getVirtualSafeAccount } from "./account";
import { erc20Abi, formatEther, parseEther, toBytes, bytesToHex, zeroAddress } from "viem";
import { BUNDLER_URL, CREATE_CALL_CONTRACT, TOKEN_FACTORY_CONTRACT } from "../config";
import CreateCallAbi from "../deploy/CreateCall.abi.json";
import { abi as tokenFactoryAbi } from "../deploy/MinimalFactory.json";

export interface TransferOptions {
  to: Address;
  amount: string;
  erc20TokenAddress?: Address;
  privateKey: `0x${string}`;
  chain: Chain;
  sponsorFee: boolean;
}

interface GasPrice {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

export interface TransactionReceipt {
  actualGasCost: bigint;
  actualGasUsed: bigint;
  entryPoint: string;
  logs: any[];
  nonce: string;
  receipt: {
    blockHash: string;
    blockNumber: bigint;
    contractAddress: string | null;
    cumulativeGasUsed: bigint;
    effectiveGasPrice: bigint;
    from: string;
    gasUsed: string;
    logs: any[];
    logsBloom: string;
    status: string;
    to: string;
    transactionHash: string;
    transactionIndex: number;
  };
  sender: string;
  success: boolean;
  userOpHash: string;
}

export interface GetGasParametersOptionsBase {
  chain: Chain;
  smartAccount: any;
  bundlerClient: any;
}

export type GetGasParametersOptions = GetGasParametersOptionsBase &
  ({ callData: `0x${string}`; tx?: never } | { tx: any; callData?: never });

const getGasParameters = async ({
  chain,
  smartAccount,
  tx,
  callData,
  bundlerClient,
}: GetGasParametersOptions) => {
  // if (chain.id !== 10 && chain.id !== 1) return null

  const gasPrice = await pimlicoGetUserOperationGasPrice(chain);
  console.log("[Gas Price]:", {
    maxFeePerGas: gasPrice.maxFeePerGas.toString(),
    maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas.toString(),
  });

  let gas: any;
  try {
    gas = !!tx
      ? await bundlerClient.estimateUserOperationGas({
          account: smartAccount,
          calls: [tx],
          maxFeePerGas: gasPrice.maxFeePerGas,
          maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
        })
      : await bundlerClient.estimateUserOperationGas({
          account: smartAccount,
          callData,
          maxFeePerGas: gasPrice.maxFeePerGas,
          maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
        });
  } catch (error: unknown) {
    console.error("[Gas Estimate Error]:", error);
    throw new Error(
      `Failed to estimate user operation gas: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  // If bundler simulation already failed, these can come back as 0 and will lead to AA23 later.
  // if (
  //   typeof gas.verificationGasLimit === "bigint" &&
  //   gas.verificationGasLimit === BigInt(0)
  // ) {
  //   // throw new Error(
  //   //   `Bundler gas estimate returned verificationGasLimit=0. This usually means validateUserOp reverted (bad signature/nonce) or the account cannot prefund gas (no paymaster + insufficient ETH). ${JSON.stringify(detail)}`
  //   // );

  //   gas.verificationGasLimit = BigInt(600000)
  // }

  const result = {
    ...gasPrice,
    ...gas,
    verificationGasLimit: BigInt(600000)
  }
  
  console.log("[gas result]:", result);
  try {
    fetch("/api/log-error", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        error: 'verificationGasLimit is 0',
        href: window.location.href,
        info: result,
        wallet_address: smartAccount.address,
      }),
    });
  } catch (error) {
    console.warn("Failed to log error to server", error);
  }
  
  return result
};

const executeUserOperation = async (params: any, bundlerClient: any) => {
  try {
    const hash = await bundlerClient.sendUserOperation(params);
    console.log("[UserOperation Hash]:", hash);

    const receipt = await bundlerClient.waitForUserOperationReceipt({ hash });
    console.log("[UserOperation Receipt]:", receipt);

    return receipt as TransactionReceipt;
  } catch (error: unknown) {
    console.error("[UserOperation Error]:", error);
    const msg = error instanceof Error ? error.message : String(error);
    const hint =
      msg.includes("AA23") || msg.includes("validateUserOp")
        ? " (AA23: account validateUserOp reverted. Common causes: wrong owner/key, wrong chain/account address, nonce mismatch, or no paymaster + insufficient ETH to prefund.)"
        : "";
    throw new Error(`Failed to execute user operation: ${msg}${hint}`);
  }
};

const assertAccountHasCode = async (publicClient: any, address: Address, sponsorFee: boolean) => {
  // if sponsorFee, we don't need to assert account has code, because the bundler will create AA for new account automatically
  if (sponsorFee) return;

  const bytecode = await publicClient.getBytecode({ address });
  if (!bytecode || bytecode === "0x") {
    throw new Error(
      `Smart account ${address} has no bytecode on this chain. Either it's not deployed on this chain, or you're signing for a different address/chain.`
    );
  }
};

const assertCanPrefund = async (
  publicClient: any,
  address: Address,
  gasParams: any,
  sponsorFee: boolean
) => {
  // If using paymaster sponsorship, prefund can be covered externally.
  if (sponsorFee) return;

  const balance: bigint = await publicClient.getBalance({ address });
  // Rough upper bound for prefund. Not perfect, but good enough for a clear UX error.
  const maxFeePerGas: bigint | undefined = gasParams?.maxFeePerGas;
  const callGasLimit: bigint = gasParams?.callGasLimit ?? BigInt(0);
  const verificationGasLimit: bigint = gasParams?.verificationGasLimit ?? BigInt(0);
  const preVerificationGas: bigint = gasParams?.preVerificationGas ?? BigInt(0);

  if (typeof maxFeePerGas === "bigint" && maxFeePerGas > 0n) {
    const estimatedGas =
      callGasLimit + verificationGasLimit + preVerificationGas + 50_000n; // small cushion
    const estimatedCost = estimatedGas * maxFeePerGas;

    if (balance < estimatedCost) {
      throw new Error(
        `Insufficient ETH to prefund gas for this UserOperation. Balance=${formatEther(
          balance
        )} ETH, estimatedNeeded≈${formatEther(estimatedCost)} ETH. Top up the smart account or enable gas sponsorship.`
      );
    }
  } else if (balance === 0n) {
    throw new Error(
      `Smart account has 0 ETH and gas sponsorship is off. Top up the smart account or enable gas sponsorship.`
    );
  }
};

export const transfer = async ({ to, amount, privateKey, chain, sponsorFee }: TransferOptions) => {
  const smartAccount = await getSafeAccount(privateKey, chain);
  const { publicClient, bundlerClient } = await prepareClient(chain, sponsorFee);

  const tx = {
    to,
    value: parseEther(amount),
  } as const;

  const params = {
    account: smartAccount,
    calls: [tx],
  };

  const gasParams = await getGasParameters({
    chain,
    smartAccount,
    tx,
    bundlerClient,
  });
  if (gasParams) {
    Object.assign(params, gasParams);
  }

  await assertAccountHasCode(publicClient, smartAccount.address, sponsorFee);
  await assertCanPrefund(publicClient, smartAccount.address, gasParams, sponsorFee);

  return executeUserOperation({...params, verificationGasLimit: BigInt(600000)}, bundlerClient);
};

export const transferErc20 = async ({
  to,
  amount,
  privateKey,
  chain,
  erc20TokenAddress,
  sponsorFee,
}: TransferOptions) => {
  if (!erc20TokenAddress) {
    throw new Error("ERC20 token address is required");
  }

  const smartAccount = await getSafeAccount(privateKey, chain);
  const { publicClient, bundlerClient } = await prepareClient(chain, sponsorFee);

  const decimals = await publicClient.readContract({
    address: erc20TokenAddress,
    abi: erc20Abi,
    functionName: "decimals",
  });

  const amountWithDecimals = BigInt(Number(amount) * 10 ** decimals);

  const tx = {
    abi: erc20Abi,
    functionName: "transfer",
    args: [to, amountWithDecimals],
    to: erc20TokenAddress,
  } as const;

  const params = {
    account: smartAccount,
    calls: [tx],
  };

  const gasParams = await getGasParameters({
    chain,
    smartAccount,
    tx,
    bundlerClient,
  });
  if (gasParams) {
    Object.assign(params, gasParams);
  }

  await assertAccountHasCode(publicClient, smartAccount.address, sponsorFee);
  await assertCanPrefund(publicClient, smartAccount.address, gasParams, sponsorFee);

  return executeUserOperation({...params, verificationGasLimit: BigInt(600000)}, bundlerClient);
};

export const pimlicoGetUserOperationGasPrice = async (chain: Chain): Promise<GasPrice> => {
  try {
    const response = await fetch(`https://api.pimlico.io/v2/10/rpc?apikey=pim_gyNBhaYL6SDxNAH4dYkUxH`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "pimlico_getUserOperationGasPrice",
        params: [],
        id: 1,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`RPC error: ${data.error.message}`);
    }

    return {
      maxFeePerGas: BigInt(data.result.standard.maxFeePerGas),
      maxPriorityFeePerGas: BigInt(data.result.standard.maxPriorityFeePerGas),
    };
  } catch (error: unknown) {
    console.error("[Gas Price Error]:", error);
    throw new Error(
      `Failed to get gas price: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

export interface EstimateGasOptions extends Omit<TransferOptions, "privateKey"> {
  safeAccountAddress: Address;
}

export const estimateGas = async ({
  to,
  amount,
  safeAccountAddress,
  chain,
  erc20TokenAddress,
  sponsorFee,
}: EstimateGasOptions) => {
  const smartAccount = await getVirtualSafeAccount(safeAccountAddress, chain);
  const { publicClient, bundlerClient } = await prepareClient(chain, sponsorFee);

  console.log("[Smart Account]:", erc20TokenAddress);

  let tx: any;
  if (!!erc20TokenAddress && erc20TokenAddress !== zeroAddress) {
    const decimals = await publicClient.readContract({
      address: erc20TokenAddress,
      abi: erc20Abi,
      functionName: "decimals",
    });
    const amountWithDecimals = BigInt(Number(amount) * 10 ** decimals);
    tx = {
      abi: erc20Abi,
      functionName: "transfer",
      args: [to, amountWithDecimals],
      to: erc20TokenAddress,
    } as const;
  } else {
    tx = {
      to,
      value: parseEther(amount),
    } as const;
  }

  const params = {
    account: smartAccount,
    calls: [tx],
  };

  return await getGasParameters({ chain, smartAccount, tx, bundlerClient });
};

export interface DeployOptions {
  privateKey: `0x${string}`;
  chain: Chain;
  callData: `0x${string}`;
  sponsorFee?: boolean;
}

export const deploy = async ({
  privateKey,
  chain,
  callData,
  sponsorFee = false,
}: DeployOptions) => {
  const smartAccount = await getSafeAccount(privateKey, chain);
  const { bundlerClient } = await prepareClient(chain, sponsorFee);

  const tx = {
    abi: CreateCallAbi,
    functionName: "performCreate2",
    args: ["0", callData, bytesToHex(toBytes(new Date().getTime().toString()), { size: 32 })],
    to: CREATE_CALL_CONTRACT[chain.id],
  } as const;

  const params = {
    account: smartAccount,
    calls: [tx],
  };

  const gasParams = await getGasParameters({
    chain,
    smartAccount,
    tx,
    bundlerClient,
  });
  if (gasParams) {
    Object.assign(params, gasParams);
  }

  return executeUserOperation(params, bundlerClient);
};

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
}: DeployTokenOptions) => {
  if (!TOKEN_FACTORY_CONTRACT[chain.id]) {
    throw new Error("Token factory contract not found");
  }

  const smartAccount = await getSafeAccount(privateKey, chain);
  const { bundlerClient } = await prepareClient(chain, sponsorFee);

  const tx = {
    abi: tokenFactoryAbi,
    functionName: "createMinimal",
    args: [name, symbol, owner, minter, initMint, maxSupply],
    to: TOKEN_FACTORY_CONTRACT[chain.id],
  } as const;

  const params = {
    account: smartAccount,
    calls: [tx],
  };

  const gasParams = await getGasParameters({
    chain,
    smartAccount,
    tx,
    bundlerClient,
  });
  if (gasParams) {
    Object.assign(params, gasParams);
  }

  return executeUserOperation(params, bundlerClient);
};
