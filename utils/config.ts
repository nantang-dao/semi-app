// Safe 部署地址是协议常量，唯一来源在 semi-core/chains。
// 这里转出只为兼容既有 import 路径。
export { SAFE_V1_4_1_DEPLOYMENTS as V1_4_1_DEPLOYMENTS } from "semi-core/chains";

/** 按链配置的合约地址 */
interface ContractAddresses {
  [chainId: number]: string;
}

export const CREATE_CALL_CONTRACT: ContractAddresses = {
  1: "0x7cbB62EaA69F79e6873cD1ecB2392971036cFAa4",
  10: "0x7cbB62EaA69F79e6873cD1ecB2392971036cFAa4",
  11155111: "0x7cbB62EaA69F79e6873cD1ecB2392971036cFAa4",
  42161: "0x7cbB62EaA69F79e6873cD1ecB2392971036cFAa4",
};

export const TOKEN_FACTORY_CONTRACT: ContractAddresses = {
  10: "0xa872b5aaa360f703f1d66ee8f52c19889c26d72e",
  11155111: "0xe45f4196a6ea36c42d8c64536bb34f69ff6c96ba",
};

// 备注上链 Proxy 地址（按链配置）
interface RemarkProxyUrl {
  [key: number]: string | undefined;
}
export const REMARK_PROXY_ADDRESS: RemarkProxyUrl = {
  10: import.meta.env.VITE_OP_REMARK_PROXY,
  11155111: import.meta.env.VITE_SEPOLIA_REMARK_PROXY,
};

