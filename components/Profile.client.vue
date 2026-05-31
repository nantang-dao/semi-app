<template>
  <div class="flex flex-col container-size h-[100vh] rounded-xl bg-[var(--ui-bg)] shadow-lg px-4 py-6 banner">
    <!-- 顶部账户信息 -->
    <div class="w-full flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <NetworkSwitch />

        <AddressDisplay :address="data.safeAddress" />
      </div>
      <div class="flex items-center gap-4">
        <UIcon name="ci:notebook" size="26" class="cursor-pointer hover:text-primary-500" @click="navigateTo('/contacts')" />
        <ProfileSettings />
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="w-full flex justify-around my-4">
      <div class="flex flex-col items-center cursor-pointer" @click="navigateTo('/receive')">
        <div class="bg-green-50 rounded-full w-14 h-14 flex items-center justify-center mb-1">
          <UIcon name="ci:qr-code" size="24" class="text-primary-500" />
        </div>
        <span class="text-sm mt-1">{{ i18n.text.Receive }}</span>
      </div>
      <div class="flex flex-col items-center cursor-pointer" @click="navigateTo('/transfer')">
        <div class="bg-purple-50 rounded-full w-14 h-14 flex items-center justify-center mb-1">
          <UIcon name="ci:external-link" size="24" class="text-purple-500" />
        </div>
        <span class="text-sm mt-1">{{ i18n.text.Send }}</span>
      </div>
      <div class="flex flex-col items-center cursor-pointer" @click="navigateTo('/actions')">
        <div class="bg-yellow-50 rounded-full w-14 h-14 flex items-center justify-center mb-1">
          <UIcon name="ci:notebook" size="24" class="text-orange-500" />
        </div>
        <span class="text-sm mt-1">{{ i18n.text.Activities }}</span>
      </div>
      <div class="flex flex-col items-center cursor-pointer" @click="navigateTo('/badges')">
        <div class="bg-blue-50 rounded-full w-14 h-14 flex items-center justify-center mb-1">
          <UIcon name="hugeicons:star-award-01" size="24" class="text-blue-500" />
        </div>
        <span class="text-sm mt-1">{{ i18n.text.Badges }}</span>
      </div>
      <div class="flex flex-col items-center cursor-pointer" @click="navigateTo('/safe')">
        <div class="bg-indigo-50 rounded-full w-14 h-14 flex items-center justify-center mb-1">
          <UIcon name="i-heroicons-shield-check" size="24" class="text-indigo-500" />
        </div>
        <span class="text-sm mt-1">Safe</span>
      </div>
    </div>

    <!-- 分割线 -->
    <div class="w-full border-t border-muted my-4"></div>

    <!-- 加载动画 -->
    <div class="flex flex-col gap-4 mt-4" v-if="loading">
      <div class="w-full h-10 rounded-lg loading-bg"></div>
      <div class="w-80 h-10 rounded-lg loading-bg"></div>
      <div class="w-full h-10 rounded-lg loading-bg"></div>
      <div class="w-80 h-10 rounded-lg loading-bg"></div>
    </div>

    <!-- 资产列表 -->
    <div class="flex flex-col flex-1 overflow-y-auto" v-else>
      <!-- 主链资产 -->
      <div class="w-full flex items-center justify-between mb-4 hover:bg-muted rounded-md py-2 px-4 cursor-pointer"
        @click="navigateTo('/transfer')">
        <div class="flex items-center gap-3">
          <img :src="'/images/eth_logo.png'" class="w-10 h-10 rounded-full" alt="eth" />
          <div>
            <div class="font-medium">
              {{ useChain.chain.nativeCurrency.symbol }}
            </div>
            <div class="text-gray-400 text-sm">{{ useChain.chain.name }}</div>
          </div>
        </div>
        <div class="flex flex-col items-end">
          <span class="font-medium">{{ displayBalance(data.balance) }}</span>
        </div>
      </div>

      <!-- 代币资产 -->
      <div class="w-full flex items-center justify-between mb-4 hover:bg-muted rounded-md py-2 px-4 cursor-pointer"
        v-for="balance in balances" @click="navigateTo(`/transfer?token_address=${balance.token.address}`)"
        :key="balance.token.address">
        <div class="flex items-center gap-3">
          <img :src="balance.token.image_url" class="w-10 h-10 rounded-full" :alt="balance.token.symbol" />
          <div>
            <div class="font-medium">{{ balance.token.symbol }}</div>
            <div class="text-gray-400 text-sm">{{ balance.token.name }}</div>
          </div>
        </div>
        <div class="flex flex-col items-end">
          <span class="font-medium">{{
            displayBalance(balance.balance, 6, balance.token.decimals)
          }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getBalance, getPopularERC20Balance, type ERC20Balance } from "~/utils/balance";
import { useUserStore } from "../stores/user";
import { useChainStore } from "../stores/chain";
import { useI18n } from "../stores/i18n";
import { displayBalance } from "~/utils/display";

const userStore = useUserStore();
const user = computed(() => userStore.user);
const loading = ref(false);
const toast = useToast();
const useChain = useChainStore();
const i18n = useI18n();
const balances = ref<ERC20Balance[]>([]);

const data = reactive({
  safeAddress: "",
  balance: BigInt(0),
});

const network = computed(() => useChain.chain);

const handleGetData = async () => {
  try {
    loading.value = true;
    data.safeAddress = user.value?.evm_chain_address as string;
    data.balance = await getBalance(user.value?.evm_chain_address as `0x${string}`, network.value);
    const { token_classes } = await getTokenClass();
    const currentTokenClasses = token_classes.filter(
      (token) => token.chain_id === network.value.id
    );
    balances.value = (
      await getPopularERC20Balance(
        currentTokenClasses,
        user.value?.evm_chain_address as `0x${string}`,
        network.value
      )
    ).sort((a, b) => Number(b.token.position - a.token.position));
  } catch (error) {
    console.error(error);
    toast.add({
      title: i18n.text["Get Data Failed"],
      description: i18n.text["Please try again later"],
      color: "error",
    });
    balances.value = [];
  } finally {
    loading.value = false;
  }
};

watch(
  [user, network],
  () => {
    handleGetData();
  },
  { immediate: true }
);
</script>
