import {
  encodePacked,
  getContractAddress,
  hexToBigInt,
  keccak256,
  type Address,
  type Chain,
  type Client,
  type Hex,
  type Transport,
} from "viem";
import { readContract } from "viem/actions";
import { getSafeDeployment, SAFE_MODULE_SETUP_ADDRESS } from "../chains";
import { proxyCreationCodeAbi } from "./abis";
import { encodeSafeInitializer } from "./initializer";

export interface PredictSafeAddressParams {
  /** 只用来读 ProxyFactory 的 proxyCreationCode() */
  client: Client<Transport, Chain | undefined>;
  chainId: number;
  owners: Address[];
  threshold: number;
  /** 同一批 owner 想要第二个钱包时改这个。默认 0。 */
  saltNonce?: bigint;
  /** 私链用。留空则取 semi-core/chains 里的官方部署地址。 */
  overrides?: {
    safeProxyFactoryAddress?: Address;
    safeSingletonAddress?: Address;
    multiSendAddress?: Address;
    safeModuleSetupAddress?: Address;
    safe4337ModuleAddress?: Address;
  };
}

/**
 * 预测 Safe v1.4.1 + EntryPoint 0.7 智能账户的地址（CREATE2，部署前即可知）。
 *
 * **owners 的顺序会影响结果**——它直接进 initializer，而 initializer 是
 * salt 的原像。调用方若把同一批 owner 视作集合，必须先自行排序。
 *
 * 只支持 1.4.1 + EP 0.7、无 ERC-7579 launchpad、无 setupTransactions——
 * 这是 Semi 实际使用的唯一组合。原来那份代码支持全部组合，1861 行里
 * 有九成从未执行过。
 */
export async function predictSafeAddress({
  client,
  chainId,
  owners,
  threshold,
  saltNonce = 0n,
  overrides = {},
}: PredictSafeAddressParams): Promise<Address> {
  if (owners.length === 0) throw new Error("predictSafeAddress: owners must not be empty");
  if (threshold < 1 || threshold > owners.length) {
    throw new Error(
      `predictSafeAddress: threshold ${threshold} is out of range for ${owners.length} owner(s)`
    );
  }

  const deployment = getSafeDeployment(chainId);
  const safeProxyFactoryAddress =
    overrides.safeProxyFactoryAddress ?? deployment.safe_proxy_factory;
  const safeSingletonAddress = overrides.safeSingletonAddress ?? deployment.safe;

  const initializer = encodeSafeInitializer({
    owners,
    threshold: BigInt(threshold),
    safeModuleSetupAddress: overrides.safeModuleSetupAddress ?? SAFE_MODULE_SETUP_ADDRESS,
    safe4337ModuleAddress: overrides.safe4337ModuleAddress ?? deployment.safe_4337_module,
    multiSendAddress: overrides.multiSendAddress ?? deployment.multi_send,
  });

  const proxyCreationCode = await readContract(client, {
    abi: proxyCreationCodeAbi,
    address: safeProxyFactoryAddress,
    functionName: "proxyCreationCode",
  });

  // ProxyFactory 把 singleton 地址附在创建码后面作为构造参数
  const deploymentCode: Hex = encodePacked(
    ["bytes", "uint256"],
    [proxyCreationCode, hexToBigInt(safeSingletonAddress)]
  );

  const salt = keccak256(encodePacked(["bytes32", "uint256"], [keccak256(initializer), saltNonce]));

  return getContractAddress({
    from: safeProxyFactoryAddress,
    salt,
    bytecode: deploymentCode,
    opcode: "CREATE2",
  });
}
