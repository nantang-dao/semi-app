<template>
  <div class="flex flex-col container-size rounded-xl bg-[var(--ui-bg)] shadow-lg p-4">
    <UButton icon="i-heroicons-arrow-left" color="neutral" variant="ghost" class="self-start mb-4"
      @click="router.push('/')">
      {{ i18n.text["Back"] }}
    </UButton>
    <div class="flex flex-col items-center justify-center h-full gap-4 pb-8 w-[80%] mx-auto">
      <h1 class="text-2xl font-bold">{{ i18n.text["Send Tokens"] }}</h1>

      <!-- 步骤1：输入转账信息 -->
      <div v-if="step === 1" class="w-full">
        <UForm :state="formState" @submit="onSubmit" class="w-full">
          <UFormField name="to" :label="i18n.text['Recipient (supports address or phone number)']">
            <div class="flex items-start flex-row gap-2">
              <UTextarea size="xl" class="w-full" variant="subtle" :rows="5" v-model="formState.to"
                :placeholder="i18n.text['Please enter recipient address/phone number']" :ui="{ base: 'w-full' }"
                :disabled="initializing" />
              <div class="flex flex-col gap-2">
                <UButton icon="ci:close-md" color="neutral" variant="subtle" size="xl" class="text-2xl cursor-pointer"
                  @click="formState.to = ''">
                </UButton>
                <ScanQrcodeBtn @onDetect="handleQrCodeDetect" />
                <ContactsButton @onSelect="handleContactSelect" />
              </div>
            </div>
          </UFormField>

          <UFormField name="amount" :label="i18n.text['Send Amount']" class="mt-4">
            <div class="flex items-center gap-2">
              <TokenSwitch :token-list="tokenList" v-model="formState.token" v-if="formState.token" />
              <UInput variant="subtle" size="xl" class="w-full flex-1" v-model="formState.amount"
                :placeholder="i18n.text['Please enter send amount']" :ui="{ base: 'w-full' }"
                :disabled="initializing || !balance" />
            </div>
          </UFormField>

          <UFormField name="memo" :label="i18n.text['Memo(optional)']" class="mt-4">
            <UInput variant="subtle" size="xl" class="w-full flex-1" v-model="formState.memo"
              :placeholder="i18n.text['Please enter memo']" :ui="{ base: 'w-full' }" :disabled="initializing" />
          </UFormField>

          <UFormField name="senderNote" :label="i18n.text['Sender Note']" class="mt-4">
            <UInput variant="subtle" size="xl" class="w-full flex-1" v-model="formState.senderNote"
              :placeholder="i18n.text['Please enter sender note']" :ui="{ base: 'w-full' }" :disabled="initializing" />
          </UFormField>


          <div class="mt-4">
            <div class="text-gray-400 text-sm">{{ i18n.text["Balance"] }}</div>
            <div class="flex items-center gap-2">
              <span class="text-3xl font-bold" v-if="initializing">-- {{ formState.token?.symbol }}</span>
              <span class="text-3xl font-bold" v-else>
                {{ displayBalance(balance, 6, formState.token?.decimals) }}
                {{ formState.token?.symbol }}
              </span>
            </div>
          </div>

          <UButton type="submit" color="primary" class="w-full mt-4 flex justify-center items-center" size="xl"
            :loading="initializing || loading" :disabled="initializing || loading || !isFormValid || !balance">
            {{ i18n.text["Next"] }}
          </UButton>
        </UForm>
      </div>

      <!-- 步骤2：输入验证码 -->
      <div v-if="step === 2" class="w-full">
        <div class="text-center mb-4">
          <div class="text-gray-400 text-sm mb-2">
            {{ i18n.text["Please enter 6-digit password"] }}
          </div>
        </div>

        <UForm :state="formState" @submit="onSubmit" class="w-full">
          <UFormField name="code">
            <UPinInput variant="subtle" type="number" v-model="formState.code" :length="6" size="xl" class="w-full"
              :ui="{ base: 'w-full' }" mask />
          </UFormField>

          <div class="text-gray-400 text-sm mt-3" v-if="formState.gasEstimate !== '0'">
            <span class="flex items-center gap-1">
              {{ i18n.text["Estimated Fee"] }}
              <FeeTipPopup />
            </span>
            <span :class="[
              'font-bold text-base text-foreground',
              formState.remainingFreeTransactions > 0 ? 'line-through' : '',
            ]">
              {{ formState.gasEstimate }} Gwei
            </span>
          </div>

          <div class="text-gray-400 text-sm mt-2">
            {{ i18n.text["Remaining free transaction count"] }}
            <span class="font-bold text-base text-foreground">
              {{ formState.remainingFreeTransactions }}
            </span>
          </div>

          <div class="flex gap-4 mt-4">
            <UButton type="button" color="neutral" class="flex-1 flex justify-center items-center" size="xl"
              :disabled="loading" @click="handleReset">
              {{ i18n.text["Previous"] }}
            </UButton>
            <UButton type="submit" color="primary" class="flex-1 flex justify-center items-center" size="xl"
              :loading="loading" :disabled="loading || !isCodeComplete">
              {{ i18n.text["Confirm"] }}
            </UButton>
          </div>
        </UForm>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useChainStore, chainMap } from "@/stores/chain";
import { useRoute, useRouter } from "vue-router";
import { useUserStore } from "@/stores/user";
import { getBalance, getErc20Balance } from "~/utils/balance";
import { predictSafeAccountAddress, transfer, transferErc20 } from "~/utils/SafeSmartAccount";
import { displayBalance } from "~/utils/display";
import { isAddress, zeroAddress } from "viem";
import { keystoreToPrivateKey } from "~/utils/encryption";
import {
  getUserByHandleOrPhone,
  getRemainingGasCredits,
  uploadTransaction,
  uploadTransactionWithGasCredits,
} from "~/utils/semi_api";
import { isGasSponsorshipChain } from "~/utils/gas_sponsorship";
import { isPhoneNumber } from "~/utils";
import { serializeError } from "serialize-error";

// 类型定义
interface FormState {
  to: string;
  recipient: string | null;
  amount: string;
  code: any[];
  token: TokenClass | undefined;
  memo: string;
  senderNote: string;
  receiverNote: string;
  remainingFreeTransactions: number;
  gasEstimate: string;
}

interface TransferParams {
  to: `0x${string}`;
  amount: string;
  privateKey: `0x${string}`;
  chain: any;
  erc20TokenAddress?: `0x${string}`;
  sponsorFee: boolean;
}

// 解决BigInt序列化问题
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

// 常量
const CODE_LENGTH = 6;
const DEFAULT_CODE = Array(CODE_LENGTH).fill("");

// 组合式函数
const route = useRoute();
const router = useRouter();
const useChain = useChainStore();
const user = useUserStore();
const toast = useToast();
const i18n = useI18n();

// 响应式状态
const initializing = ref(false);
const loading = ref(false);
const balance = ref<bigint>(BigInt(0));
const step = ref(1);

const formState = reactive<FormState>({
  to: "",
  recipient: null,
  amount: "",
  code: [...DEFAULT_CODE],
  token: undefined,
  remainingFreeTransactions: 0,
  gasEstimate: "0",
  memo: "",
  senderNote: "",
  receiverNote: "",
});

// 计算属性
const nativeToken = computed(
  (): TokenClass => ({
    address: zeroAddress,
    name: useChain.chain.nativeCurrency.name,
    symbol: useChain.chain.nativeCurrency.symbol,
    decimals: useChain.chain.nativeCurrency.decimals,
    image_url: "/images/eth_logo.png",
    chain_id: useChain.chain.id,
    chain: useChain.chain.name.toLowerCase(),
    token_type: "NATIVE_COIN",
    publisher_address: zeroAddress,
    position: 0,
    description: "",
  })
);

const tokenList = ref<TokenClass[]>([nativeToken.value]);

const isFormValid = computed(() => {
  if (!formState.to || !formState.amount) return false;
  if (!isAddress(formState.to) && !isPhoneNumber(formState.to)) return false;
  if (isNaN(Number(formState.amount)) || Number(formState.amount) <= 0) return false;
  return true;
});

const isCodeComplete = computed(() => {
  return formState.code.length === CODE_LENGTH && formState.code.every((digit) => digit !== "");
});

// 工具函数
const getErrorMessage = (error: unknown): string => {
  if (!(error instanceof Error)) return i18n.text["Please try again later"];
  if (!error.message) return i18n.text["Please try again later"];

  return error.message.includes(
    "Smart Account does not have sufficient funds to execute the User Operation"
  )
    ? i18n.text["Insufficient balance to pay gas fees"]
    : error.message;
};

const handleError = (error: unknown, title: string, description?: string) => {
  console.error(error);
  try {
    $fetch("/api/log-error", {
      method: "POST",
      body: {
        error: serializeError(error),
        href: window.location.href,
        info: formState,
        wallet_address: user.user?.evm_chain_address,
      },
    });
  } catch (error) {
    console.warn("Failed to log error to server", error);
  }

  toast.add({
    title,
    description:
      description || (error instanceof Error ? error.message : i18n.text["Please try again later"]),
    color: "error",
  });
};

const resetForm = () => {
  step.value = 1;
  formState.recipient = null;
  formState.code = [...DEFAULT_CODE];
  formState.senderNote = "";
  formState.receiverNote = "";
};

// 业务逻辑函数
const fetchTokenBalance = async () => {
  if (!formState.token) return;

  try {
    initializing.value = true;
    const predictSafeAddress = await predictSafeAccountAddress({
      owner: user.user?.evm_chain_active_key as `0x${string}`,
      chain: useChain.chain,
    });

    balance.value =
      formState.token.address === zeroAddress
        ? await getBalance(predictSafeAddress, useChain.chain)
        : await getErc20Balance(
          predictSafeAddress,
          formState.token.address as `0x${string}`,
          useChain.chain
        );
  } catch (error) {
    handleError(error, i18n.text["Get balance failed"]);
  } finally {
    initializing.value = false;
  }
};

const validateBalance = (): boolean => {
  if (!formState.token) return false;

  const amount = Number(formState.amount) * 10 ** (formState.token.decimals as number);
  if (amount > Number(balance.value)) {
    handleError(new Error(i18n.text["Insufficient balance"]), i18n.text["Insufficient balance"]);
    return false;
  }
  return true;
};

const resolveRecipient = async (): Promise<boolean> => {
  try {
    if (isPhoneNumber(formState.to)) {
      const recipient = await getUserByHandleOrPhone(formState.to);
      if (!recipient?.evm_chain_address) {
        handleError(
          new Error(i18n.text["Invalid phone number"]),
          i18n.text["Invalid phone number"]
        );
        return false;
      }
      formState.recipient = recipient.evm_chain_address as `0x${string}`;
    } else {
      formState.recipient = formState.to as `0x${string}`;
    }
    return true;
  } catch (error) {
    handleError(
      error,
      i18n.text["Get recipient address failed"],
      i18n.text["Please check if the phone number is correct"]
    );
    return false;
  }
};

const fetchGasCredits = async (): Promise<boolean> => {
  try {
    if (isGasSponsorshipChain(useChain.chain.id)) {
      const { remaining_free_transactions } = await getRemainingGasCredits();
      formState.remainingFreeTransactions = remaining_free_transactions;
    } else {
      formState.remainingFreeTransactions = 0;
    }
    return true;
  } catch (error) {
    handleError(
      error,
      error instanceof Error ? error.message : i18n.text["Get free transaction count failed"],
      i18n.text["Please try again later"]
    );
    return false;
  }
};

const handleTokenTransfer = async () => {
  if (!formState.token || !formState.recipient) return;

  loading.value = true;
  let privateKey = "";
  try {
    privateKey = await keystoreToPrivateKey(
      JSON.parse(user.user?.encrypted_keys as string),
      formState.code.join("")
    );
  } catch (error) {
    handleError(error, i18n.text["Invalid passcode"], "");
    return false;
  }

  try {
    const transferParams: TransferParams = {
      to: formState.recipient as `0x${string}`,
      amount: formState.amount,
      privateKey: privateKey as `0x${string}`,
      chain: useChain.chain,
      sponsorFee: isGasSponsorshipChain(useChain.chain.id) && formState.remainingFreeTransactions > 0,
    };

    // 如果是ERC20代币，添加代币地址
    if (formState.token.address !== zeroAddress) {
      transferParams.erc20TokenAddress = formState.token.address as `0x${string}`;
    }

    const receipt = await (formState.token.address === zeroAddress
      ? transfer(transferParams)
      : transferErc20(transferParams));

    const uploadData = {
      tx_hash: receipt.receipt.transactionHash,
      gas_used: receipt.actualGasCost.toString(),
      status: receipt.success ? "success" : "failed",
      chain: useChain.chain.name.toLowerCase(),
      data: JSON.stringify(receipt) as any,
      memo: formState.memo,
      sender_note: formState.senderNote,
      receiver_note: formState.receiverNote,
      sender_address: user.user?.evm_chain_address || "",
      receiver_address: formState.recipient as string,
    };

    if (transferParams.sponsorFee) {
      await uploadTransactionWithGasCredits(uploadData);
    } else {
      await uploadTransaction(uploadData);
    }

    toast.add({
      title: i18n.text["Transfer Success"],
      description: i18n.text["Transfer has been submitted"],
      color: "success",
    });
    router.push("/");
  } catch (error) {
    handleError(error, i18n.text["Transfer Failed"], getErrorMessage(error));
    resetForm();
  } finally {
    loading.value = false;
  }
};

const initForm = async () => {
  const { to, amount, chain_id, token_address } = route.query;

  // 处理链ID
  if (chain_id && typeof chain_id === "string") {
    const numChainId = Number(chain_id);
    if (numChainId in chainMap) {
      await useChain.switch(numChainId);
    } else {
      handleError(
        new Error(i18n.text["Invalid chain ID"]),
        i18n.text["Invalid chain ID"],
        i18n.text["Chain ID in URL is incorrect"]
      );
    }
  }

  // 处理代币地址
  const { token_classes } = await getTokenClass();
  const currentTokenClasses = token_classes.filter((token) => token.chain_id === useChain.chain.id);
  tokenList.value = [nativeToken.value, ...currentTokenClasses];

  if (token_address && typeof token_address === "string") {
    const targetToken = currentTokenClasses.find((token) => token.address === token_address);
    formState.token = targetToken || nativeToken.value;
    if (!targetToken) {
      handleError(
        new Error(i18n.text["Invalid token address"]),
        i18n.text["Invalid token address"],
        i18n.text["Token address in URL is incorrect or unsupported token"]
      );
    }
  } else {
    formState.token = nativeToken.value;
  }

  // 处理接收地址
  if (to && typeof to === "string" && isAddress(to)) {
    formState.to = to;
  } else if (to && typeof to === "string") {
    toast.add({
      title: i18n.text["Invalid address"],
      description: i18n.text["Chain ID in URL is incorrect"],
      color: "error",
    });
  }

  // 处理金额
  if (amount && typeof amount === "string") {
    const numAmount = Number(amount);
    if (!isNaN(numAmount) && numAmount > 0) {
      formState.amount = amount;
    } else {
      handleError(
        new Error(i18n.text["Invalid amount"]),
        i18n.text["Invalid amount"],
        i18n.text["Amount in URL must be a number greater than 0"]
      );
    }
  }
};

const onSubmit = async () => {
  if (step.value === 1) {
    if (!validateBalance()) return;

    loading.value = true;

    // 解析接收地址
    if (!(await resolveRecipient())) {
      loading.value = false;
      return;
    }

    // 获取免手续费交易次数
    if (!(await fetchGasCredits())) {
      loading.value = false;
      return;
    }

    loading.value = false;
    step.value = 2;
    return;
  }

  await handleTokenTransfer();
};

const handleQrCodeDetect = (values: string[]) => {
  if (values.length > 0) {
    const address = values[0];
    if (isAddress(address)) {
      formState.to = address;
      toast.add({
        title: i18n.text["Scan successful"],
        description: i18n.text["Recipient address has been filled"],
        color: "success",
      });
    } else {
      handleError(
        new Error(i18n.text["Invalid address"]),
        i18n.text["Invalid address"],
        i18n.text["Scanned QR code is not a valid Ethereum address"]
      );
    }
  }
};

// 处理联系人选择
const handleContactSelect = (address: string) => {
  if (isAddress(address)) {
    formState.to = address;
  }
};

const handleReset = () => {
  resetForm();
};

// 监听器
watch(() => formState.token, fetchTokenBalance, { immediate: true });

// 生命周期
onMounted(initForm);
</script>
