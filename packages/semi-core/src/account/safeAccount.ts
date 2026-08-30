import { privateKeyToAccount } from "viem/accounts";
import { toSafeSmartAccount } from "permissionless/accounts";
import type { Address, Hex } from "viem";
import { ENTRY_POINT_07_ADDRESS, getSafeDeployment } from "../chains";
import type { ChainContext } from "../config";
import { predictSafeAddress } from "../safe";

const SAFE_VERSION = "1.4.1" as const;

/**
 * owner 地址升序排列。
 *
 * **顺序直接决定 Safe 的地址** —— 它进 initializer，initializer 是 CREATE2
 * salt 的原像。permissionless 不会替你排（它只排 ERC-7579 的 attesters），
 * 所以本包里凡是构造账户或预测地址的地方都必须用同一个规则，否则同一批
 * owner 会算出两个不同的钱包。
 */
const sortOwners = (owners: readonly Address[]): Address[] =>
  [...owners].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
const ENTRY_POINT = { address: ENTRY_POINT_07_ADDRESS, version: "0.7" } as const;

function deploymentAddresses(chainId: number) {
  const d = getSafeDeployment(chainId);
  return {
    safeProxyFactoryAddress: d.safe_proxy_factory,
    safeSingletonAddress: d.safe,
    multiSendAddress: d.multi_send,
    multiSendCallOnlyAddress: d.multi_send_call_only,
  };
}

/**
 * 占位 owner。
 *
 * permissionless 需要一组 owner **账户对象**来复原 initCode，但只有真正
 * 签名的那个需要私钥。其余 owner 用一个固定私钥造出账户再把 address 覆盖
 * 成真实地址——地址参与 initCode 计算，私钥不参与。
 *
 * 序号从 1 开始：私钥 0 不是有效的 secp256k1 标量。
 */
function placeholderOwner(index: number, address: Address) {
  const key = `0x${(index + 1).toString(16).padStart(64, "0")}` as Hex;
  return { ...privateKeyToAccount(key), address };
}

export interface GetSafeAccountParams {
  privateKey: Hex;
  /** 多签钱包必须传全部 owner，否则复原出的 initCode 对不上 */
  owners?: Address[];
  threshold?: number;
}

/** 可签名的 Safe 智能账户（签名者 = privateKey 对应的 EOA） */
export async function getSafeAccount(
  ctx: ChainContext,
  { privateKey, owners, threshold }: GetSafeAccountParams
) {
  const signer = privateKeyToAccount(privateKey);

  const allOwners =
    owners && owners.length > 0
      ? sortOwners(owners).map((addr, i) =>
          addr.toLowerCase() === signer.address.toLowerCase() ? signer : placeholderOwner(i, addr)
        )
      : [signer];

  return toSafeSmartAccount({
    client: ctx.publicClient,
    entryPoint: ENTRY_POINT,
    owners: allOwners,
    threshold: BigInt(threshold ?? 1),
    version: SAFE_VERSION,
    ...deploymentAddresses(ctx.chainId),
  });
}

export interface GetVirtualSafeAccountParams {
  address: Address;
  owners?: Address[];
  threshold?: number;
  /** 不知道具体 owner 地址、只需要个数时用（估 gas 场景） */
  ownerCount?: number;
}

/**
 * 只读的 Safe 账户，用于估算 gas。没有任何真实私钥，不能签名。
 *
 * 多签必须传真实的 owners：initCode 由 owner 列表算出，传错了估出来的
 * gas 就不是这个账户的。
 */
export async function getVirtualSafeAccount(
  ctx: ChainContext,
  { address, owners, threshold = 1, ownerCount }: GetVirtualSafeAccountParams
) {
  const allOwners =
    owners && owners.length > 0
      ? sortOwners(owners).map((addr, i) => placeholderOwner(i, addr))
      : Array.from({ length: ownerCount ?? threshold }, (_, i) =>
          privateKeyToAccount(`0x${(i + 1).toString(16).padStart(64, "0")}` as Hex)
        );

  return toSafeSmartAccount({
    address,
    client: ctx.publicClient,
    entryPoint: ENTRY_POINT,
    owners: allOwners,
    threshold: BigInt(threshold),
    version: SAFE_VERSION,
    ...deploymentAddresses(ctx.chainId),
  });
}

export interface PredictAddressParams {
  owner?: Address;
  owners?: Address[];
  threshold?: number;
  saltNonce?: bigint;
}

/**
 * 预测 Safe 地址。owner 列表会先按地址排序——顺序会改变结果，
 * 而调用方通常把 owner 当集合看待。
 */
export function predictAddress(
  ctx: ChainContext,
  { owner, owners, threshold, saltNonce }: PredictAddressParams
): Promise<Address> {
  const list = owners ? sortOwners(owners) : owner ? [owner] : [];

  return predictSafeAddress({
    client: ctx.publicClient,
    chainId: ctx.chainId,
    owners: list,
    threshold: threshold ?? 1,
    saltNonce,
  });
}
