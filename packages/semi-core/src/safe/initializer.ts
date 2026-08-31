import { encodeFunctionData, encodePacked, zeroAddress, type Address, type Hex } from "viem";
import { enableModulesAbi, multiSendAbi, safeSetupAbi } from "./abis";

/** MultiSend 的紧凑打包格式：operation ‖ to ‖ value ‖ dataLength ‖ data */
function encodeInternalTransaction(tx: {
  to: Address;
  data: Hex;
  value: bigint;
  operation: 0 | 1;
}): string {
  return encodePacked(
    ["uint8", "address", "uint256", "uint256", "bytes"],
    [tx.operation, tx.to, tx.value, BigInt(tx.data.slice(2).length / 2), tx.data]
  ).slice(2);
}

export function encodeMultiSend(
  txs: { to: Address; data: Hex; value: bigint; operation: 0 | 1 }[]
): Hex {
  const data: Hex = `0x${txs.map(encodeInternalTransaction).join("")}`;
  return encodeFunctionData({ abi: multiSendAbi, functionName: "multiSend", args: [data] });
}

export interface SafeInitializerParams {
  owners: Address[];
  threshold: bigint;
  safeModuleSetupAddress: Address;
  safe4337ModuleAddress: Address;
  multiSendAddress: Address;
}

/**
 * Safe 部署时传给代理的 initializer calldata。
 *
 * 这串字节决定 CREATE2 的 salt，也就决定了钱包地址——它的任何一处改动都会
 * 让同一批 owner 算出不同的地址。改这里等于换掉所有用户的钱包。
 *
 * 结构是：`setup()` 里带一个 delegatecall 到 SafeModuleSetup 的 MultiSend，
 * 用来在部署的同一笔交易里启用 4337 module。
 */
export function encodeSafeInitializer({
  owners,
  threshold,
  safeModuleSetupAddress,
  safe4337ModuleAddress,
  multiSendAddress,
}: SafeInitializerParams): Hex {
  const enableModules = encodeMultiSend([
    {
      to: safeModuleSetupAddress,
      data: encodeFunctionData({
        abi: enableModulesAbi,
        functionName: "enableModules",
        args: [[safe4337ModuleAddress]],
      }),
      value: 0n,
      operation: 1, // delegatecall
    },
  ]);

  return encodeFunctionData({
    abi: safeSetupAbi,
    functionName: "setup",
    args: [
      owners,
      threshold,
      multiSendAddress,
      enableModules,
      safe4337ModuleAddress, // fallbackHandler
      zeroAddress, // paymentToken
      0n, // payment
      zeroAddress, // paymentReceiver
    ],
  });
}
