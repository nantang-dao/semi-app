import { encodeFunctionData, erc20Abi, getAddress, isAddress, parseEther, parseUnits, type Address } from "viem";
import { getErc20Decimals, type MultisigCall } from "semi-core";
import { chainContext } from "~/utils/semi_core";
import {
  encodeAddOwnerCall,
  encodeChangeThresholdCall,
  encodeRemoveOwnerCall,
  encodeSwapOwnerCall,
} from "~/utils/SafeSmartAccount/multisig";
import type { MultisigTx } from "~/utils/multisig_api";

/**
 * 从页面展示给签名人的字段（call_detail）推出这笔多签交易要执行的调用。
 *
 * 这是签名前核对快照的依据，所以只信 call_detail 里人看得到的字段：
 *   - 金额、收款人、新 owner、门限都从 call_detail 重新编码，不取后端存的
 *     evm_call_data；evm_call_data 存在时要求与重新编码的结果一致；
 *   - ERC20 的 decimals 读合约，不信后端元数据；
 *   - 任何附加调用（旧版的 remark_to / remark_data）一律拒绝——它在页面上看不见，
 *     等于让提案人塞一个签名人看不到的调用。
 * 推不出来就抛错，宁可签不了，也不签看不懂的东西。
 */
export async function callFromTx(t: MultisigTx, safe: Address): Promise<MultisigCall> {
  const d = t.call_detail ?? {};
  if (d.remark_to || d.remark_data) {
    throw new Error("该提案带有页面上不可见的附加调用，拒绝签名。请重新发起提案。");
  }

  const call = await buildCall(t, safe, d);
  const stored = (t.evm_call_data || "0x").toLowerCase();
  const expectedData = (call.data ?? "0x").toLowerCase();
  // cancel / ETH 转账没有 data，后端存的应是 0x；其余类型存的必须就是重新编码的结果
  if (stored !== "0x" && stored !== expectedData) {
    throw new Error("提案的调用数据与展示的内容不一致，拒绝签名。");
  }
  return call;
}

async function buildCall(t: MultisigTx, safe: Address, d: Record<string, any>): Promise<MultisigCall> {
  switch (t.tx_type) {
    case "cancel":
      return { to: safe, value: 0n, data: "0x" };

    case "transfer":
      return { to: addr(d.to, "to"), value: parseEther(amountOf(d)), data: "0x" };

    case "erc20_transfer": {
      const token = addr(d.token_address, "token_address");
      const decimals = await getErc20Decimals(chainContext(t.chain_id), token);
      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [addr(d.to, "to"), parseUnits(amountOf(d), decimals)],
      });
      return { to: token, value: 0n, data };
    }

    case "add_owner":
      return { to: safe, value: 0n, data: encodeAddOwnerCall(addr(d.new_owner, "new_owner"), threshold(d)) };

    case "remove_owner":
      return {
        to: safe,
        value: 0n,
        data: encodeRemoveOwnerCall(addr(d.prev_owner, "prev_owner"), addr(d.owner, "owner"), threshold(d)),
      };

    case "replace_owner":
      return {
        to: safe,
        value: 0n,
        data: encodeSwapOwnerCall(
          addr(d.prev_owner, "prev_owner"),
          addr(d.old_owner, "old_owner"),
          addr(d.new_owner, "new_owner")
        ),
      };

    case "change_threshold":
      return { to: safe, value: 0n, data: encodeChangeThresholdCall(threshold(d)) };

    default:
      throw new Error(`不支持的多签交易类型：${t.tx_type}`);
  }
}

function addr(value: unknown, field: string): Address {
  if (typeof value !== "string" || !isAddress(value)) {
    throw new Error(`提案字段 ${field} 不是合法地址，拒绝签名。`);
  }
  return getAddress(value);
}

function amountOf(d: Record<string, any>): string {
  const amount = String(d.amount ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(amount)) throw new Error("提案金额格式不正确，拒绝签名。");
  return amount;
}

function threshold(d: Record<string, any>): number {
  const n = Number(d.new_threshold);
  if (!Number.isInteger(n) || n < 1) throw new Error("提案门限不正确，拒绝签名。");
  return n;
}

