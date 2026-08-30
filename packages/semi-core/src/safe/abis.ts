/**
 * 只保留地址预测这条路径真正用到的 ABI 片段。
 * 完整 ABI 没必要——多出来的部分只会让人以为这里能做更多事。
 */

export const safeSetupAbi = [
  {
    inputs: [
      { internalType: "address[]", name: "_owners", type: "address[]" },
      { internalType: "uint256", name: "_threshold", type: "uint256" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "bytes", name: "data", type: "bytes" },
      { internalType: "address", name: "fallbackHandler", type: "address" },
      { internalType: "address", name: "paymentToken", type: "address" },
      { internalType: "uint256", name: "payment", type: "uint256" },
      { internalType: "address payable", name: "paymentReceiver", type: "address" },
    ],
    name: "setup",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export const enableModulesAbi = [
  {
    inputs: [{ internalType: "address[]", name: "modules", type: "address[]" }],
    name: "enableModules",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export const multiSendAbi = [
  {
    inputs: [{ internalType: "bytes", name: "transactions", type: "bytes" }],
    name: "multiSend",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
] as const;

export const proxyCreationCodeAbi = [
  {
    inputs: [],
    name: "proxyCreationCode",
    outputs: [{ internalType: "bytes", name: "", type: "bytes" }],
    stateMutability: "pure",
    type: "function",
  },
] as const;
