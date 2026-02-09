import { formatUnits, type Chain, zeroAddress } from "viem";
import bignumber from "bignumber.js";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";
import { entryPoint07Address } from "viem/account-abstraction";

dayjs.locale("zh-cn");
dayjs.extend(relativeTime);

export function formatAddress(address: string) {
  return address.slice(0, 6) + "..." + address.slice(-4);
}

export function displayBalance(wei: bigint, fixed = 6, decimals = 18) {
  const value = formatUnits(wei, decimals);
  const str = new bignumber(value).toFormat(fixed, 1);
  // remove trailing zeros
  return str.replace(/\.?0+$/, "");
}

export interface ActionPreview {
  id?: number;
  from: string;
  to: string;
  value: bigint;
  date: string;
  status: string;
  direction: string;
  token: string | "NATIVE_COIN";
  type: string;
  txHex: string;
  symbol?: string;
  decimals?: number;
  memo?: string;
  senderNote?: string;
  receiverNote?: string;
  senderHandle?: string | null;
  receiverHandle?: string | null;
}

export function parseSendActions(history: any[]) {
  const actions: ActionPreview[] = [];
  history
    .filter((item) => item.type === "TRANSACTION" && item.transaction.txInfo.type !== "Creation")
    .forEach((item) => {
      console.log("item", item);
      actions.push({
        from: item.transaction.txInfo.sender.value,
        to: item.transaction.txInfo.recipient.value,
        value: item.transaction.txInfo.transferInfo.value,
        date: item.transaction.timestamp,
        status: item.transaction.txStatus,
        direction: item.transaction.direction,
        token: item.transaction.txInfo.transferInfo.type,
        type: item.transaction.txInfo.type,
        txHex: item.transaction.txHash,
        symbol: item.transaction.txInfo.transferInfo.tokenSymbol,
        decimals: item.transaction.txInfo.transferInfo.decimals,
      });
    });

  return actions;
}

export function parseActionsFromAlchemyApi(
  history: any[],
  chain: Chain,
  direction: "income" | "outgoing",
  tokenClasses: TokenClass[]
) {
  const supportedTokens = tokenClasses;
  if (!supportedTokens) {
    throw new Error("Unsupported chain");
  }

  const actions: ActionPreview[] = [];
  history
    .filter((item) => item.to.toLowerCase() !== entryPoint07Address.toLowerCase())
    .forEach((item) => {
      if (!item.rawContract?.address) {
        // native coin
        actions.push({
          from: item.from,
          to: item.to,
          value: BigInt(item.rawContract.value),
          date: item.metadata.blockTimestamp,
          status: "SUCCESS",
          direction: direction,
          token: zeroAddress,
          type: item.category,
          txHex: item.hash,
          symbol: chain.nativeCurrency.symbol,
          decimals: chain.nativeCurrency.decimals,
        });
        return;
      }

      const token = supportedTokens.find(
        (token) => token.address.toLowerCase() === item.rawContract?.address.toLowerCase()
      );
      if (!token) {
        return;
      }

      actions.push({
        from: item.from,
        to: item.to,
        value: BigInt(item.rawContract.value),
        date: item.metadata.blockTimestamp,
        status: "SUCCESS",
        direction: direction,
        token: token.address,
        type: item.category,
        txHex: item.hash,
        symbol: token.symbol,
        decimals: token.decimals,
      });
    });

  return actions;
}

export function displayDate(date: string) {
  return dayjs(date).fromNow();
}
