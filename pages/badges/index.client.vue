<template>
  <div
    class="flex flex-col container-size h-[100vh] rounded-xl bg-[var(--ui-bg)] shadow-lg px-4 sm:px-8 py-8 banner"
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

    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-bold">{{ i18n.text["Badges"] }}</h1>
      <NuxtLink
        v-if="activeMainTab === 'badges'"
        href="/badges/create"
        class="flex items-center gap-1 text-sm text-primary hover:underline"
      >
        <span>{{ i18n.text["Create New Badges"] }}</span>
        <UIcon name="ci:add-plus-square" size="20" />
      </NuxtLink>
    </div>

    <!-- 主标签切换：徽章 和 NFTs -->
    <div class="flex gap-2 mb-4 border-b border-gray-200">
      <button
        @click="activeMainTab = 'badges'"
        :class="[
          'px-4 py-2 font-medium transition-colors',
          activeMainTab === 'badges'
            ? 'text-primary border-b-2 border-primary'
            : 'text-gray-500 hover:text-gray-700'
        ]"
      >
        {{ i18n.text["Badges"] }}
      </button>
      <button
        @click="activeMainTab = 'nfts'"
        :class="[
          'px-4 py-2 font-medium transition-colors',
          activeMainTab === 'nfts'
            ? 'text-primary border-b-2 border-primary'
            : 'text-gray-500 hover:text-gray-700'
        ]"
      >
        {{ i18n.text["NFTs"] }}
      </button>
    </div>

    <div v-if="isLoading" class="flex flex-col gap-4">
      <div class="w-full h-10 rounded-lg loading-bg"></div>
      <div class="w-80 h-10 rounded-lg loading-bg"></div>
      <div class="w-full h-10 rounded-lg loading-bg"></div>
      <div class="w-80 h-10 rounded-lg loading-bg"></div>
      <div class="w-full h-10 rounded-lg loading-bg"></div>
    </div>

    <!-- 徽章内容 -->
    <div v-else-if="activeMainTab === 'badges'">
      <UTabs :items="badgeTabs" :unmount-on-hide="false" class="w-full overflow-auto">
        <template #owned="{ item }">
          <NoBadge v-if="ownedBadges.length === 0" />
          <div class="grid grid-cols-3 gap-3 py-4" v-else>
            <BadgeItem :badge="badge" v-for="(badge, index) in ownedBadges" :key="index" />
          </div>
        </template>
        <template #created="{ item }">
          <NoBadge v-if="badgeClasses.length === 0" />
          <div class="grid grid-cols-3 gap-3 py-4" v-else>
            <BadgeClass
              :badge-class="badgeClass"
              v-for="(badgeClass, index) in badgeClasses"
              :key="index"
            />
          </div>
        </template>
        <template #pending="{ item }">
          <NoBadge v-if="pendingBadges.length === 0" />
          <div class="grid grid-cols-3 gap-3 py-4" v-else>
            <BadgeItem
              @update="fetchData"
              :badge="badge"
              v-for="(badge, index) in pendingBadges"
              :key="index"
            />
          </div>
        </template>
      </UTabs>
    </div>

    <!-- NFTs内容 -->
    <div v-else-if="activeMainTab === 'nfts'">
      <NoNFT v-if="nfts.length === 0" />
      <div class="grid grid-cols-3 gap-3 py-4" v-else>
        <NFTItem :nft="nft" v-for="(nft, index) in nfts" :key="index" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TabsItem } from "@nuxt/ui";
import type { BadgeClass, Badge } from "@/server/api/badge/types";
import type { NFT } from "@/server/utils/nft";

const i18n = useI18n();
const router = useRouter();
const user = useUserStore();
const useChain = useChainStore();

const badgeClasses = ref<BadgeClass[]>([]);
const pendingBadges = ref<Badge[]>([]);
const ownedBadges = ref<Badge[]>([]);
const nfts = ref<NFT[]>([]);
const isLoading = ref(true);
const activeMainTab = ref<"badges" | "nfts">("badges");

const badgeTabs: TabsItem[] = [
  {
    label: i18n.text["Owned"],
    slot: "owned" as const,
  },
  {
    label: i18n.text["Created"],
    slot: "created" as const,
  },
  {
    label: i18n.text["Pending"],
    slot: "pending" as const,
  },
];

const fetchBadgeClasses = async () => {
  const url = `/api/badge/classes/list?chain_id=${useChain.chain.id}&wallet_address=${user.user?.evm_chain_address}`;
  const { data, error } = await useFetch<{
    data: { badge_classes: BadgeClass[] };
  }>(url);
  if (error.value) {
    console.error(error.value);
  } else if (!!data.value) {
    badgeClasses.value = data.value.data.badge_classes as BadgeClass[];
  }
};

const fetchPendingBadges = async () => {
  const url = `/api/badge/pending?chain_id=${useChain.chain.id}&wallet_address=${user.user?.evm_chain_address}`;
  const { data, error } = await useFetch<{ data: { badges: Badge[] } }>(url);
  if (error.value) {
    console.error(error.value);
  } else if (!!data.value) {
    pendingBadges.value = data.value.data.badges as Badge[];
  }
};

const fetchOwnedBadges = async () => {
  const url = `/api/badge/owned?chain_id=${useChain.chain.id}&wallet_address=${user.user?.evm_chain_address}`;
  const { data, error } = await useFetch<{ data: { badges: Badge[] } }>(url);
  if (error.value) {
    console.error(error.value);
  } else if (!!data.value) {
    ownedBadges.value = data.value.data.badges as Badge[];
  }
};

const fetchNFTs = async () => {
  const url = `/api/nft/owned?chain_id=${useChain.chain.id}&wallet_address=${user.user?.evm_chain_address}`;
  const { data, error } = await useFetch<{
    success: boolean;
    message: string;
    data: { nfts: NFT[] };
  }>(url);
  if (error.value) {
    console.error("获取NFT失败：", error.value);
  } else if (!!data.value && data.value.success) {
    nfts.value = data.value.data.nfts as NFT[];
  } else {
    console.error("获取NFT失败：", data.value?.message || "未知错误");
  }
};

const fetchData = async () => {
  await Promise.allSettled([
    fetchBadgeClasses(),
    fetchPendingBadges(),
    fetchOwnedBadges(),
    fetchNFTs(),
  ]).finally(() => {
    console.log("数据获取完成");
    isLoading.value = false;
  });
};

fetchData();
</script>

<style scoped></style>
