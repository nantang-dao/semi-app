<template>
  <div class="flex flex-col container-size rounded-xl bg-[var(--ui-bg)] shadow-lg p-4">
    <UButton
      icon="i-heroicons-arrow-left"
      color="neutral"
      variant="ghost"
      class="self-start mb-4"
      @click="router.push('/')"
    >
      {{ i18n.text["Back"] }}
    </UButton>
    <div class="flex flex-col items-center justify-center h-full gap-4 pb-8 w-[80%] mx-auto">
      <h1 class="text-2xl font-bold" v-if="step != 3">
        {{ i18n.text["Deploy Factory"] }}
      </h1>

      <!-- 步骤1：输入代币信息 -->
      <div v-if="step === 1" class="w-full">
        <UForm :state="formState" @submit="onSubmit" class="w-full">
          <UButton
            type="submit"
            color="primary"
            class="w-full mt-6 flex justify-center items-center"
            size="xl"
            :loading="initializing || loading"
            :disabled="initializing || loading || !isFormValid"
          >
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
            <UPinInput
              variant="subtle"
              type="number"
              v-model="formState.code"
              :length="6"
              size="xl"
              class="w-full"
              :ui="{ base: 'w-full' }"
              mask
            />
          </UFormField>

          <div class="flex gap-4 mt-4">
            <UButton
              type="button"
              color="neutral"
              class="flex-1 flex justify-center items-center"
              size="xl"
              :disabled="loading"
              @click="handleReset"
            >
              {{ i18n.text["Previous"] }}
            </UButton>
            <UButton
              type="submit"
              color="primary"
              class="flex-1 flex justify-center items-center"
              size="xl"
              :loading="loading"
              :disabled="loading || !isCodeComplete"
            >
              {{ i18n.text["Confirm Deploy"] }}
            </UButton>
          </div>
        </UForm>
      </div>

      <!-- 步骤3：部署结果 -->
      <div v-if="step === 3" class="w-full">
        <div class="text-center mb-6">
          <UIcon name="ci:circle-check-outline" class="text-green-500 text-8xl" />
          <h2 class="text-xl font-semibold mb-2">
            {{ i18n.text["Deploy Success"] }}
          </h2>
          <p class="text-gray-500 text-sm">
            {{ i18n.text["Token contract has been successfully deployed to blockchain"] }}
          </p>
        </div>

        <div class="space-y-4 mb-6">
          <UFormField name="contractAddress" :label="i18n.text['Contract Address']">
            <div class="flex flex-row gap-2 items-start">
              <UTextarea
                variant="subtle"
                size="xl"
                class="w-full"
                v-model="newContractAddress"
                :placeholder="i18n.text['Contract Address']"
                :ui="{ base: 'w-full' }"
                :disabled="true"
                readonly
              />
              <div class="flex flex-col gap-2 items-start">
                <UButton
                  type="button"
                  variant="outline"
                  color="neutral"
                  size="xl"
                  @click="handleCopy(newContractAddress)"
                >
                  <UIcon
                    name="ci:copy"
                    size="22"
                    class="cursor-pointer hover:text-primary-500 text-sm"
                  />
                </UButton>
                <UButton
                  type="button"
                  variant="outline"
                  color="neutral"
                  size="xl"
                  @click="gotoExplorer(newContractAddress, 'address')"
                >
                  <UIcon
                    name="ci:globe"
                    size="22"
                    class="cursor-pointer hover:text-primary-500 text-sm"
                  />
                </UButton>
              </div>
            </div>
          </UFormField>

          <UFormField name="txHash" :label="i18n.text['Transaction Hash']">
            <div class="flex flex-row gap-2 items-start">
              <UTextarea
                variant="subtle"
                size="xl"
                class="w-full"
                v-model="txHash"
                :placeholder="i18n.text['Transaction Hash']"
                :ui="{ base: 'w-full' }"
                :disabled="true"
                readonly
              />
              <div class="flex flex-col gap-2 items-start">
                <UButton
                  type="button"
                  variant="outline"
                  color="neutral"
                  size="xl"
                  @click="handleCopy(txHash)"
                >
                  <UIcon
                    name="ci:copy"
                    size="22"
                    class="cursor-pointer hover:text-primary-500 text-sm"
                  />
                </UButton>

                <UButton
                  type="button"
                  variant="outline"
                  color="neutral"
                  size="xl"
                  @click="gotoExplorer(txHash, 'tx')"
                >
                  <UIcon
                    name="ci:globe"
                    size="22"
                    class="cursor-pointer hover:text-primary-500 text-sm"
                  />
                </UButton>
              </div>
            </div>
          </UFormField>
        </div>

        <UButton
          type="button"
          color="primary"
          class="w-full flex justify-center items-center"
          size="xl"
          @click="handleConfirm"
        >
          {{ i18n.text["Confirm"] }}
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useChainStore } from "@/stores/chain";
import { useRouter } from "vue-router";
import { useUserStore } from "@/stores/user";
import { encodeDeployData } from "viem";
import { keystoreToPrivateKey } from "semi-core/keys";
import { abi, bytecode } from "~/utils/deploy/MinimalFactory.json";
import { deploy } from "~/utils/SafeSmartAccount/operation";

// 类型定义
interface FormState {
  code: string[];
}

// 常量
const CODE_LENGTH = 6;
const DEFAULT_CODE = Array(CODE_LENGTH).fill("");

// 组合式函数
const router = useRouter();
const useChain = useChainStore();
const useUser = useUserStore();
const i18n = useI18n();
const toast = useToast();

// 响应式状态
const initializing = ref(false);
const loading = ref(false);
const step = ref(1);
const newContractAddress = ref("");
const txHash = ref("");

const formState = reactive<FormState>({
  code: [...DEFAULT_CODE],
});

// 计算属性
const isFormValid = computed(() => {
  return true;
});

const isCodeComplete = computed(() => {
  return formState.code.length === CODE_LENGTH && formState.code.every((digit) => digit !== "");
});

// 工具函数
const getErrorMessage = (error: unknown): string => {
  if (!(error instanceof Error)) return i18n.text["Please try again"];
  if (!error.message) return i18n.text["Please try again"];

  return error.message.includes(
    "Smart Account does not have sufficient funds to execute the User Operation"
  )
    ? i18n.text["Insufficient balance to pay gas fees"]
    : error.message;
};

const handleError = (error: unknown, title: string, description?: string) => {
  console.error(error);
  toast.add({
    title,
    description:
      description || (error instanceof Error ? error.message : i18n.text["Please try again"]),
    color: "error",
  });
};

const resetForm = () => {
  step.value = 1;
  formState.code = [...DEFAULT_CODE];
};

// 业务逻辑函数
const deployToken = async () => {
  loading.value = true;
  try {
    const privateKey = await keystoreToPrivateKey(
      JSON.parse(useUser.user?.encrypted_keys as string),
      formState.code.join("")
    );

    // TODO: 实现部署函数
    const deployData = encodeDeployData({
      abi,
      bytecode: bytecode.object as `0x${string}`,
      args: [],
    });

    const receipt = await deploy({
      privateKey: privateKey as `0x${string}`,
      chain: useChain.chain,
      callData: deployData,
    });

    console.log("[deploy contract receipt]: ", receipt);
    const targetLog = receipt.logs.find(
      (log: any) => log.address === CREATE_CALL_CONTRACT[useChain.chain.id]
    );
    if (targetLog) {
      console.log("[targetLog]: ", targetLog);
      newContractAddress.value = "0x" + targetLog.data.slice(26);
      txHash.value = receipt.receipt.transactionHash;
    }

    step.value = 3;
    toast.add({
      title: i18n.text["Deploy Success"],
      description: i18n.text["Factory contract has been successfully deployed to blockchain"],
      color: "success",
    });
  } catch (error) {
    handleError(error, i18n.text["Deploy Failed"], getErrorMessage(error));
    resetForm();
  } finally {
    loading.value = false;
  }
};

const onSubmit = async () => {
  if (step.value === 1) {
    step.value = 2;
    return;
  }

  await deployToken();
};

const handleReset = () => {
  resetForm();
};

const handleConfirm = () => {
  // 重置所有表单字段到初始状态
  Object.assign(formState, {
    name: "",
    symbol: "",
    owner: import.meta.env.VITE_TOKEN_OWNER!,
    enablePreMint: false,
    minter: "",
    initMint: "",
    code: [...DEFAULT_CODE],
  });

  // 重置其他状态
  step.value = 1;
  newContractAddress.value = "";
  txHash.value = "";
};

const handleCopy = (text: string) => {
  navigator.clipboard.writeText(text);
  toast.add({
    title: i18n.text["Copy Success"],
    description: i18n.text["Contract address has been copied to clipboard"],
    color: "success",
  });
};

const gotoExplorer = (addressOrTxHash: string, type: "address" | "tx") => {
  window.open(
    useChain.chain.blockExplorers?.default.url + "/" + type + "/" + addressOrTxHash,
    "_blank"
  );
};
</script>
