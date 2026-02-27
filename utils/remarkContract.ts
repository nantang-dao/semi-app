export const remarkProxyAbi = [
  {
    inputs: [
      { name: "taskId", type: "string", internalType: "string" },
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
