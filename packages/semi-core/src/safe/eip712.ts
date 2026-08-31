/**
 * SafeOp 的 EIP-712 类型定义（Safe 4337 Module，EntryPoint v0.7）。
 *
 * 字段顺序和类型宽度都是签名原像的一部分。改动任何一处，算出的哈希就和
 * 链上 `checkSignatures` 期望的不一致，交易会 revert——而且是在收齐所有
 * 多签签名之后才失败。
 *
 * 特别注意 verificationGasLimit / callGasLimit 与
 * maxPriorityFeePerGas / maxFeePerGas 这两对的**顺序与 v0.6 相反**，
 * 且是 uint128 而非 uint256。
 */
export const EIP712_SAFE_OPERATION_TYPE_V07 = {
  SafeOp: [
    { type: "address", name: "safe" },
    { type: "uint256", name: "nonce" },
    { type: "bytes", name: "initCode" },
    { type: "bytes", name: "callData" },
    { type: "uint128", name: "verificationGasLimit" },
    { type: "uint128", name: "callGasLimit" },
    { type: "uint256", name: "preVerificationGas" },
    { type: "uint128", name: "maxPriorityFeePerGas" },
    { type: "uint128", name: "maxFeePerGas" },
    { type: "bytes", name: "paymasterAndData" },
    { type: "uint48", name: "validAfter" },
    { type: "uint48", name: "validUntil" },
    { type: "address", name: "entryPoint" },
  ],
} as const;
