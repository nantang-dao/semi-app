import { toSafeSmartAccount } from "permissionless/accounts";
import { privateKeyToAccount } from "viem/accounts";
import { type Chain } from "viem/chains";
import { http, createPublicClient, type Address } from "viem";
import { getSafeDeployment } from "semi-core/chains";
import { predictSafeAddress } from "semi-core/safe";
import { entryPoint07Address } from "viem/account-abstraction";
import { RPC_URL } from "../config";

/**
 * permissionless 的 toSafeSmartAccount 要的那几个地址，从 semi-core 的
 * 部署表里取——这里原本是第三份硬编码副本。
 */
const safeAddressesFor = (chainId: number) => {
  const d = getSafeDeployment(chainId);
  return {
    safeProxyFactoryAddress: d.safe_proxy_factory,
    safeSingletonAddress: d.safe,
    multiSendAddress: d.multi_send,
    multiSendCallOnlyAddress: d.multi_send_call_only,
  };
};

export const getSafeAccount = async (
  privateKey: `0x${string}`,
  chain: Chain,
  options?: { owners?: Address[]; threshold?: number }
) => {

  const signer = privateKeyToAccount(privateKey);

  const client = createPublicClient({
    chain,
    transport: http(RPC_URL[chain.id]),
  });

  let allOwners: ReturnType<typeof privateKeyToAccount>[];
  if (options?.owners && options.owners.length > 0) {
    // Multisig: signer is always first, others are dummy accounts with correct addresses
    allOwners = options.owners.map((addr) =>
      addr.toLowerCase() === signer.address.toLowerCase()
        ? signer
        : { ...privateKeyToAccount(`0x${"0".repeat(63)}1`), address: addr }
    );
  } else {
    allOwners = [signer];
  }

  const account = await toSafeSmartAccount({
    client,
    entryPoint: { address: entryPoint07Address, version: "0.7" },
    owners: allOwners,
    threshold: options?.threshold ?? 1,
    version: "1.4.1",
    ...safeAddressesFor(chain.id),
  });

  return account;
};

// 获取虚拟safe账户，用于预估gas（multisig 须传入真实 owners 地址以匹配 initCode）
export const getVirtualSafeAccount = async (
  safeAccountAddress: Address,
  chain: Chain,
  options?: { threshold?: number; owners?: Address[]; ownerCount?: number }
) => {

  const threshold = options?.threshold ?? 1;

  let allOwners: ReturnType<typeof privateKeyToAccount>[];
  if (options?.owners && options.owners.length > 0) {
    const sorted = [...options.owners].sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    );
    allOwners = sorted.map((addr, i) => {
      const key = `0x${"0".repeat(62)}${(i + 1).toString(16).padStart(2, "0")}` as `0x${string}`;
      return { ...privateKeyToAccount(key), address: addr };
    });
  } else {
    const ownerCount = options?.ownerCount ?? threshold;
    allOwners = Array.from({ length: ownerCount }, (_, i) => {
      const key = `0x${"0".repeat(62)}${(i + 1).toString(16).padStart(2, "0")}` as `0x${string}`;
      return privateKeyToAccount(key);
    });
  }

  const client = createPublicClient({
    chain,
    transport: http(RPC_URL[chain.id]),
  });

  const account = await toSafeSmartAccount({
    address: safeAccountAddress,
    client,
    entryPoint: { address: entryPoint07Address, version: "0.7" },
    owners: allOwners,
    threshold,
    version: "1.4.1",
    ...safeAddressesFor(chain.id),
  });

  return account;
};

export const predictSafeAccountAddress = async ({
  owner,
  chain,
  owners,
  threshold,
}: {
  owner?: Address;
  chain: Chain;
  owners?: Address[];
  threshold?: number;
}): Promise<Address> => {
  const client = createPublicClient({
    chain,
    transport: http(RPC_URL[chain.id]),
  });

  // Sort owners by address for deterministic address generation
  const ownerList = owners ? [...owners].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())) : [owner!];

  return predictSafeAddress({
    client,
    chainId: chain.id,
    owners: ownerList,
    threshold: threshold ?? 1,
  });
};
