import type { Address } from "viem";

/** ERC-4337 EntryPoint v0.7 —— 所有链上同一地址 */
export const ENTRY_POINT_07_ADDRESS: Address = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

/** Safe 4337 Module（同时是 SafeOp EIP-712 的 verifyingContract） */
export const SAFE_4337_MODULE_ADDRESS: Address = "0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226";

/** Safe owner 链表的哨兵节点。owner 位于表头时，prevOwner 用它。 */
export const SENTINEL_OWNERS: Address = "0x0000000000000000000000000000000000000001";

/**
 * SafeModuleSetup，用于在部署时 delegatecall 启用 4337 module。
 *
 * 注意这是 **EntryPoint 0.7** 的地址。Safe 部署表里的 `add_module_lib`
 * （0x8EcD…）是 EntryPoint 0.6 的那个，两者不能混用——用错会算出完全
 * 不同的钱包地址。
 */
export const SAFE_MODULE_SETUP_ADDRESS: Address = "0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47";
