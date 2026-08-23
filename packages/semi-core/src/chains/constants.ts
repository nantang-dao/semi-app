import type { Address } from "viem";

/** ERC-4337 EntryPoint v0.7 —— 所有链上同一地址 */
export const ENTRY_POINT_07_ADDRESS: Address = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

/** Safe 4337 Module（同时是 SafeOp EIP-712 的 verifyingContract） */
export const SAFE_4337_MODULE_ADDRESS: Address = "0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226";

/** Safe owner 链表的哨兵节点。owner 位于表头时，prevOwner 用它。 */
export const SENTINEL_OWNERS: Address = "0x0000000000000000000000000000000000000001";
