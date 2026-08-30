import { concat, pad, toHex, type Address, type Hex } from "viem";

export interface PaymasterFields {
  paymaster?: Address | undefined;
  paymasterVerificationGasLimit?: bigint | undefined;
  paymasterPostOpGasLimit?: bigint | undefined;
  paymasterData?: Hex | undefined;
}

/**
 * 把 v0.7 拆开的 paymaster 字段打包成 SafeOp EIP-712 里那一个
 * `paymasterAndData` 字节串：paymaster ‖ verificationGasLimit(16B)
 * ‖ postOpGasLimit(16B) ‖ data。
 *
 * 签名承诺的是这个打包形式，提交给 bundler 的却是拆开的字段——两者必须
 * 严格对应，否则签名校验过不了。
 */
export function packPaymasterAndData(fields: PaymasterFields): Hex {
  if (!fields.paymaster) return "0x";
  return concat([
    fields.paymaster,
    pad(toHex(fields.paymasterVerificationGasLimit ?? 0n), { size: 16 }),
    pad(toHex(fields.paymasterPostOpGasLimit ?? 0n), { size: 16 }),
    fields.paymasterData ?? "0x",
  ]);
}
