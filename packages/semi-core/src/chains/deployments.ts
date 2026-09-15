import type { Address } from "viem";

/** Safe v1.4.1 官方部署地址。除私链外，所有链上这套地址都相同。 */
export interface SafeDeployment {
  compatibility_fallback_handler: Address;
  create_call: Address;
  multi_send: Address;
  multi_send_call_only: Address;
  safe: Address;
  safe_l2: Address;
  safe_migration: Address;
  safe_proxy_factory: Address;
  safe_to_l2_migration: Address;
  safe_to_l2_setup: Address;
  sign_message_lib: Address;
  simulate_tx_accessor: Address;
  safe_4337_module: Address;
  add_module_lib: Address;
}

/**
 * Safe 1.4.1 用 CREATE2 + 相同 salt 部署，所以除了 `safe_to_l2_setup`
 * （OP 上是另一个地址）之外，各链地址一致。共享这份基表，按链覆盖差异项。
 */
const SAFE_V1_4_1_CANONICAL: SafeDeployment = {
  compatibility_fallback_handler: "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99",
  create_call: "0x9b35Af71d77eaf8d7e40252370304687390A1A52",
  multi_send: "0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526",
  multi_send_call_only: "0x9641d764fc13c8B624c04430C7356C1C7C8102e2",
  safe: "0x41675C099F32341bf84BFc5382aF534df5C7461a",
  safe_l2: "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762",
  safe_migration: "0x526643F69b81B008F46d95CD5ced5eC0edFFDaC6",
  safe_proxy_factory: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
  safe_to_l2_migration: "0xfF83F6335d8930cBad1c0D439A841f01888D9f69",
  safe_to_l2_setup: "0xfF83F6335d8930cBad1c0D439A841f01888D9f69",
  sign_message_lib: "0xd53cd0aB83D845Ac265BE939c57F53AD838012c9",
  simulate_tx_accessor: "0x3d4BA2E0884aa488718476ca2FB8Efc291A46199",
  safe_4337_module: "0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226",
  add_module_lib: "0x8EcD4ec46D4D2a6B64fE960B3D64e8B94B2234eb",
};

export const SAFE_V1_4_1_DEPLOYMENTS: Record<number, SafeDeployment> = {
  // mainnet
  1: SAFE_V1_4_1_CANONICAL,
  // optimism
  10: {
    ...SAFE_V1_4_1_CANONICAL,
    safe_to_l2_setup: "0xBD89A1CE4DDe368FFAB0eC35506eEcE0b1fFdc54",
  },
  // sepolia
  11155111: SAFE_V1_4_1_CANONICAL,
  // arbitrum one（与 OP 一样，SafeToL2Setup 在 0xBD89…，已链上核实）
  42161: {
    ...SAFE_V1_4_1_CANONICAL,
    safe_to_l2_setup: "0xBD89A1CE4DDe368FFAB0eC35506eEcE0b1fFdc54",
  },
};

export const getSafeDeployment = (chainId: number): SafeDeployment => {
  const deployment = SAFE_V1_4_1_DEPLOYMENTS[chainId];
  if (!deployment) {
    throw new Error(`No Safe v1.4.1 deployment known for chain ${chainId}`);
  }
  return deployment;
};
