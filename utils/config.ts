// Safe 部署地址是协议常量，唯一来源在 semi-core/chains。
// 这里转出只为兼容既有 import 路径。
export { SAFE_V1_4_1_DEPLOYMENTS as V1_4_1_DEPLOYMENTS } from "semi-core/chains";

export interface BundlerUrl {
  [key: number]: string;
}

export interface RPCUrl {
  [key: number]: string;
}

export interface PaymasterUrl {
  [key: number]: string | undefined;
}

export const SUPPORTED_CHAINS = [10] as const;

export const BUNDLER_URL: BundlerUrl = {
  1: import.meta.env.VITE_MAINNET_BUNDLER_URL!,
  10: import.meta.env.VITE_OP_BUNDLER_URL!,
  11155111: import.meta.env.VITE_SEPOLIA_BUNDLER_URL!,
};

// `pimlico_getUserOperationGasPrice` is a Pimlico-specific RPC method, served from
// Pimlico's own endpoint regardless of which bundler (e.g. ZeroDev) we submit through.
// The API key comes from env — never hardcode it in source.
export const PIMLICO_API_KEY = import.meta.env.VITE_PIMLICO_API_KEY as string | undefined;

export const pimlicoGasPriceUrl = (chainId: number): string => {
  if (!PIMLICO_API_KEY) {
    throw new Error("VITE_PIMLICO_API_KEY is not configured (required for gas price)");
  }
  return `https://api.pimlico.io/v2/${chainId}/rpc?apikey=${PIMLICO_API_KEY}`;
};

export const RPC_URL: RPCUrl = {
  1: `${import.meta.env.VITE_MAINNET_RPC_URL!}/${import.meta.env.VITE_INFURA_API_KEY!}`,
  10: `${import.meta.env.VITE_OP_RPC_URL!}/${import.meta.env.VITE_INFURA_API_KEY!}`,
  11155111: `${import.meta.env.VITE_SEPOLIA_RPC_URL!}/${import.meta.env.VITE_INFURA_API_KEY!}`,
};

export const PAYMASTER_URL: PaymasterUrl = {
  10: import.meta.env.VITE_OP_PAYMASTER,
};

export const CREATE_CALL_CONTRACT: RPCUrl = {
  1: "0x7cbB62EaA69F79e6873cD1ecB2392971036cFAa4",
  10: "0x7cbB62EaA69F79e6873cD1ecB2392971036cFAa4",
  11155111: "0x7cbB62EaA69F79e6873cD1ecB2392971036cFAa4",
};

export const TOKEN_FACTORY_CONTRACT: RPCUrl = {
  10: "0xa872b5aaa360f703f1d66ee8f52c19889c26d72e",
  11155111: "0xe45f4196a6ea36c42d8c64536bb34f69ff6c96ba",
};

// 备注上链 Proxy 地址（按链配置）
export interface RemarkProxyUrl {
  [key: number]: string | undefined;
}
export const REMARK_PROXY_ADDRESS: RemarkProxyUrl = {
  10: import.meta.env.VITE_OP_REMARK_PROXY,
  11155111: import.meta.env.VITE_SEPOLIA_REMARK_PROXY,
};

// bai 后端 API 基址，用于拉取 receiver_remark（GET /api/tasks/:id/receiver-remark）
export const BAI_API_BASE_URL = import.meta.env.VITE_BAI_API_URL || "";
