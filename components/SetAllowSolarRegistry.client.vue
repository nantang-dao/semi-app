<template>
  <div class="mx-aut p-3">
    <UForm :state="mintParams" @submit="handleMint" class="w-full flex flex-col gap-4">
      <UFormField name="contractAddress" label="Contract Address">
        <UInput
          variant="subtle"
          size="md"
          class="w-full"
          v-model="mintParams.contractAddress"
          placeholder="Enter contract address"
        />
      </UFormField>
      <UFormField name="chainId" label="Chain ID">
        <USelect
          variant="subtle"
          size="md"
          class="w-full"
          v-model="mintParams.chainId"
          :items="chainOptions"
          placeholder="Select Chain"
        />
      </UFormField>
      <UFormField name="pinCode" label="6-digit Password">
        <UPinInput
          variant="subtle"
          type="number"
          v-model="mintParams.pinCode"
          :length="6"
          size="xl"
          class="w-full"
          :ui="{ base: 'w-full' }"
          mask
        />
      </UFormField>
      <UButton
        type="submit"
        color="primary"
        class="w-full mt-6 flex justify-center items-center"
        size="xl"
        :loading="pending"
        :disabled="pending"
      >
        Set Allow
      </UButton>
    </UForm>
    <div
      v-if="result"
      class="mt-6 border border-[var(--ui-border)] rounded-xl px-4 pb-4 flex flex-col gap-2 bg-[var(--ui-bg-muted)]"
    >
      <div class="font-bold text-white p-2 border-b border-gray-600">Mint Success !</div>
      <div class="font-bold text-center break-all flex flex-row items-center gap-3">
        <div class="shrink-0">Tx:</div>
        <AddressDisplay :address="result" :showAvatar="false" :compact="true" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { registry, createClientConfig, chains } from "solar-contract-sdk";
import { useChainStore, chainMap } from "@/stores/chain";
import { useUserStore } from "@/stores/user";
import { keystoreToPrivateKey } from "semi-core/keys";
import { privateKeyToAccount, type Account } from "viem/accounts";

const CODE_LENGTH = 6;
const DEFAULT_CODE = Array(CODE_LENGTH).fill("");

const chainStore = useChainStore();
const userStore = useUserStore();
const toast = useToast();
const result = ref<any>(null);

const pending = ref(false);

const mintParams = ref({
  contractAddress: "",
  chainId: chainStore.chain.id,
  pinCode: DEFAULT_CODE,
});

// 创建链选项列表
const chainOptions = computed(() => {
  return Object.values(chainMap).map((chain) => chain.id);
});

// 解决BigInt序列化问题
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

const handleMint = async () => {
  pending.value = true;
  try {
    if (chainStore.chain.id !== mintParams.value.chainId) {
      await chainStore.switch(mintParams.value.chainId);
    }

    const privateKey = await keystoreToPrivateKey(
      JSON.parse(userStore.user?.encrypted_keys as string),
      mintParams.value.pinCode.join("")
    );

    const account = privateKeyToAccount(privateKey as `0x${string}`) as any;

    const clientConfig = createClientConfig({
      chainId: chainStore.chain.id as keyof typeof chains,
    });

    const txHash = await registry.setContractAllowed({
      contractAddress: mintParams.value.contractAddress as `0x${string}`,
      params: {
        addr: mintParams.value.contractAddress as `0x${string}`,
        status: true,
      },
      account: account,
      clientConfig,
    });
    console.log(txHash);
    result.value = txHash;
  } catch (error) {
    console.error(error);
    toast.add({
      title: "Mint failed",
      color: "error",
      description: error instanceof Error ? error.message : "mint failed",
    });
  } finally {
    pending.value = false;
  }
};
</script>

<style scoped></style>
