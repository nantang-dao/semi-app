<template>
  <div
    class="flex flex-col container-size rounded-xl bg-[var(--ui-bg)] shadow-lg p-4"
    :style="{ maxHeight: `90svh` }"
  >
    <UButton
      icon="i-heroicons-arrow-left"
      color="neutral"
      variant="ghost"
      class="self-start mb-4"
      @click="router.push('/')"
    >
      {{ i18n.text["Back"] }}
    </UButton>
    <div class="flex-1 pb-4 w-[90%] mx-auto overflow-y-auto">
      <div class="text-2xl font-bold text-center mb-4" v-if="step != 3">
        {{ i18n.text["Deploy Token"] }}
      </div>

      <!-- 步骤1：输入代币信息 -->
      <div v-if="step === 1" class="w-full">
        <UForm :state="formState" @submit="onSubmit" class="w-full">
          <UFormField name="name" :label="i18n.text['Token Name']">
            <UInput
              variant="subtle"
              size="md"
              class="w-full"
              v-model="formState.name"
              :placeholder="i18n.text['Please enter token name']"
              :ui="{ base: 'w-full' }"
              :disabled="initializing"
            />
          </UFormField>

          <UFormField name="symbol" :label="i18n.text['Token Symbol']" class="mt-4">
            <UInput
              variant="subtle"
              size="md"
              class="w-full"
              v-model="formState.symbol"
              :placeholder="i18n.text['Please enter token symbol']"
              :ui="{ base: 'w-full' }"
              :disabled="initializing"
            />
          </UFormField>

          <UFormField name="minter" :label="i18n.text['Minter Address']" class="mt-4">
            <UInput
              variant="subtle"
              size="md"
              class="w-full"
              v-model="formState.minter"
              :placeholder="i18n.text['Please enter minter address']"
              :ui="{ base: 'w-full' }"
              :disabled="initializing"
            />
            <div class="text-sm text-gray-500 mt-2">
              {{ i18n.text["Minter has the right to mint tokens"] }}
            </div>
          </UFormField>

          <UFormField name="maxSupply" :label="i18n.text['Max Supply']" class="mt-4">
            <UInput
              variant="subtle"
              size="md"
              class="w-full"
              v-model="formState.maxSupply"
              :placeholder="i18n.text['Please enter max supply']"
              :ui="{ base: 'w-full' }"
              :disabled="initializing"
            />
            <div class="text-sm text-gray-500 mt-2">
              {{ i18n.text["The maximum number of tokens that can be minted"] }}
            </div>
          </UFormField>

          <UFormField name="initMint" :label="i18n.text['Initial Mint Amount']" class="mt-4">
            <UInput
              variant="subtle"
              size="md"
              class="w-full"
              v-model="formState.initMint"
              :placeholder="i18n.text['Please enter initial mint amount']"
              :ui="{ base: 'w-full' }"
              :disabled="initializing"
            />
            <div class="text-sm text-gray-500 mt-2">
              {{ i18n.text["Tokens will be sent to the minter"] }}
            </div>
          </UFormField>

          <UFormField name="icon" :label="i18n.text['Icon']" class="mt-4">
            <UploadFile v-model="formState.icon" />
          </UFormField>

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
import { isAddress, zeroAddress, parseEther } from "viem";
import { keystoreToPrivateKey } from "semi-core/keys";
import { deployToken } from "~/utils/SafeSmartAccount/operation";
import { addTokenClass } from "~/utils/semi_api";
import { TOKEN_FACTORY_CONTRACT } from "~/utils/config";

// 类型定义
interface FormState {
  name: string;
  symbol: string;
  owner: string;
  minter: string;
  initMint: string;
  code: string[];
  icon: string;
  maxSupply: string;
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

const defaultFormState = {
  name: "",
  symbol: "",
  owner: import.meta.env.VITE_TOKEN_OWNER || useUser.user?.evm_chain_address || zeroAddress,
  minter: "",
  initMint: "",
  code: [...DEFAULT_CODE],
  icon: "https://datastore.sola.day/kg8ddpwy_r5he8h1o9",
  maxSupply: "",
};

const formState = reactive<FormState>(Object.assign({}, defaultFormState));

// 计算属性
const isFormValid = computed(() => {
  if (!formState.name || !formState.symbol || !formState.owner) return false;
  if (!isAddress(formState.owner)) return false;
  if (!!formState.minter && !isAddress(formState.minter)) return false;
  if (
    !!formState.initMint &&
    (isNaN(Number(formState.initMint)) || Number(formState.initMint) <= 0)
  )
    return false;
  if (
    !formState.maxSupply ||
    isNaN(Number(formState.maxSupply)) ||
    Number(formState.maxSupply) <= 0
  )
    return false;

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
const HandleDeployToken = async () => {
  loading.value = true;
  try {
    // TokenFactory 只部署在 OP 和 Sepolia，其他链直接拦下，避免交易发出后才崩
    if (!TOKEN_FACTORY_CONTRACT[useChain.chain.id]) {
      throw new Error(`${useChain.chain.name} 暂不支持发行代币`);
    }
    const privateKey = await keystoreToPrivateKey(
      JSON.parse(useUser.user?.encrypted_keys as string),
      formState.code.join("")
    );

    console.log("[deployToken]: ", useChain.chain);
    const receipt = await deployToken({
      privateKey: privateKey as `0x${string}`,
      chain: useChain.chain,
      name: formState.name,
      symbol: formState.symbol,
      owner: formState.owner as `0x${string}`,
      minter: (formState.minter || zeroAddress) as `0x${string}`,
      initMint: formState.initMint ? parseEther(formState.initMint).toString() : "0",
      maxSupply: parseEther(formState.maxSupply).toString(),
    });

    console.log("[deploy contract receipt]: ", receipt);
    txHash.value = receipt.receipt.transactionHash;
    const targetLog = receipt.logs.find(
      (log: any) =>
        log.address.toLowerCase() === TOKEN_FACTORY_CONTRACT[useChain.chain.id].toLowerCase()
    );
    if (targetLog) {
      console.log("[targetLog]: ", targetLog);
      newContractAddress.value = "0x" + targetLog.topics[1].slice(26);
    }

    // 上传代币信息
    await addTokenClass({
      token_type: "ERC20",
      chain_id: useChain.chain.id,
      chain: useChain.chain.name.toLowerCase(),
      address: newContractAddress.value,
      name: formState.name,
      symbol: formState.symbol,
      image_url: formState.icon,
      publisher_address: useUser.user?.evm_chain_address || zeroAddress,
      position: 0,
      description: "",
      decimals: 18,
    });

    // 解决BigInt序列化问题
    (BigInt.prototype as any).toJSON = function () {
      return this.toString();
    };

    // 上传部署记录
    await uploadTransactionWithGasCredits({
      tx_hash: receipt.receipt.transactionHash,
      gas_used: receipt.actualGasCost.toString(),
      status: receipt.success ? "success" : "failed",
      chain: useChain.chain.name.toLowerCase(),
      data: JSON.stringify(receipt) as any,
      memo: "",
      sender_address: useUser.user?.evm_chain_address || "",
      receiver_address: TOKEN_FACTORY_CONTRACT[useChain.chain.id],
    });

    step.value = 3;
    toast.add({
      title: i18n.text["Deploy Success"],
      description: i18n.text["Token contract has been successfully deployed to blockchain"],
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

  await HandleDeployToken();
};

const handleReset = () => {
  resetForm();
};

const handleConfirm = () => {
  // 重置所有表单字段到初始状态
  Object.assign(formState, {
    name: "",
    symbol: "",
    owner: import.meta.env.VITE_TOKEN_OWNER || useUser.user?.evm_chain_address || zeroAddress,
    minter: "",
    initMint: "",
    maxSupply: "",
    code: [...DEFAULT_CODE],
    icon: "https://datastore.sola.day/kg8ddpwy_r5he8h1o9",
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
