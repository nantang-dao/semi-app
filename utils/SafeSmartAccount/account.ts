import { toSafeSmartAccount } from "permissionless/accounts";
import { predictSafeSmartAccountAddress } from "./utils";
import { privateKeyToAccount } from "viem/accounts";
import { type Chain } from "viem/chains";
import { http, createPublicClient, type Address } from "viem";
import { V1_4_1_DEPLOYMENTS } from "../config";
import { entryPoint07Address } from "viem/account-abstraction";
import { RPC_URL } from "../config";

const SAFE_COMMON_ADDRESSES = {
  safeProxyFactoryAddress: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67" as Address,
  safeSingletonAddress: "0x41675C099F32341bf84BFc5382aF534df5C7461a" as Address,
  multiSendAddress: "0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526" as Address,
  multiSendCallOnlyAddress: "0x9641d764fc13c8B624c04430C7356C1C7C8102e2" as Address,
};

export const getSafeAccount = async (
  privateKey: `0x${string}`,
  chain: Chain,
  options?: { owners?: Address[]; threshold?: number }
) => {
  const deployment = V1_4_1_DEPLOYMENTS[chain.id];
  if (!deployment) throw new Error(`Deployment for chain ${chain.name} not found`);

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
    ...SAFE_COMMON_ADDRESSES,
  });

  return account;
};

// 获取虚拟safe账户，用于预估gas（multisig 须传入真实 owners 地址以匹配 initCode）
export const getVirtualSafeAccount = async (
  safeAccountAddress: Address,
  chain: Chain,
  options?: { threshold?: number; owners?: Address[]; ownerCount?: number }
) => {
  const deployment = V1_4_1_DEPLOYMENTS[chain.id];
  if (!deployment) throw new Error(`Deployment for chain ${chain.name} not found`);

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
    ...SAFE_COMMON_ADDRESSES,
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
  const deployment = V1_4_1_DEPLOYMENTS[chain.id];
  if (!deployment) throw new Error(`Deployment for chain ${chain.name} not found`);

  const client = createPublicClient({
    chain,
    transport: http(RPC_URL[chain.id]),
  });

  // Sort owners by address for deterministic address generation
  const ownerList = owners ? [...owners].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())) : [owner!];

  const address = await predictSafeSmartAccountAddress({
    client,
    owners: ownerList,
    threshold: threshold ?? 1,
    version: "1.4.1",
    entryPoint: { address: entryPoint07Address, version: "0.7" },
    ...SAFE_COMMON_ADDRESSES,
  });
  return address;
};
