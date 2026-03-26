export const remarkProxyAbi = [
  {
    inputs: [
      { name: "poolId", type: "uint256", internalType: "uint256" },
      { name: "taskId", type: "uint256", internalType: "uint256" },
      { name: "senderRemark", type: "string", internalType: "string" },
      { name: "receiverRemark", type: "string", internalType: "string" },
    ],
    name: "saveRemark",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export const REMARK_MAX_CHARS = 32;
