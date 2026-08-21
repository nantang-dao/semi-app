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
        @click="updateMainTab('badges')"
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
        @click="updateMainTab('nfts')"
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

    <div v-if="currentTabLoading" class="flex flex-col gap-4">
      <div class="w-full h-10 rounded-lg loading-bg"></div>
      <div class="w-80 h-10 rounded-lg loading-bg"></div>
      <div class="w-full h-10 rounded-lg loading-bg"></div>
      <div class="w-80 h-10 rounded-lg loading-bg"></div>
      <div class="w-full h-10 rounded-lg loading-bg"></div>
    </div>

    <!-- 徽章内容 -->
    <div v-else-if="activeMainTab === 'badges'">
      <UTabs
        :items="badgeTabs"
        v-model="activeSubTab"
        :unmount-on-hide="false"
        class="w-full overflow-auto"
      >
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
              @update="fetchBadges"
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
const route = useRoute();
const user = useUserStore();
const useChain = useChainStore();

const badgeClasses = ref<BadgeClass[]>([]);
const pendingBadges = ref<Badge[]>([]);
const ownedBadges = ref<Badge[]>([]);
const nfts = ref<NFT[]>([]);

// Badges and NFTs load independently: the NFT call hits Alchemy and is an order
// of magnitude slower, so it must never gate the badge tabs.
const badgesLoading = ref(true);
const nftsLoading = ref(false);
const nftsLoaded = ref(false);

const badgeTabs = computed<TabsItem[]>(() => [
  {
    label: i18n.text["Owned"],
    slot: "owned" as const,
    value: "owned",
  },
  {
    label: i18n.text["Created"],
    slot: "created" as const,
    value: "created",
  },
  {
    label: i18n.text["Pending"],
    slot: "pending" as const,
    value: "pending",
  },
]);

type MainTab = "badges" | "nfts";
type BadgeSubTab = "owned" | "created" | "pending";

const firstQueryValue = (v: unknown): string | undefined => {
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : undefined;
  return typeof v === "string" ? v : undefined;
};

const parseMainTab = (v: unknown): MainTab => {
  const tab = firstQueryValue(v);
  return tab === "nfts" ? "nfts" : "badges";
};

const parseSubTab = (v: unknown): BadgeSubTab => {
  const subtab = firstQueryValue(v);
  return subtab === "created" || subtab === "pending" || subtab === "owned" ? subtab : "owned";
};

const activeMainTab = ref<MainTab>(parseMainTab(route.query.tab));
const activeSubTab = ref<BadgeSubTab>(parseSubTab(route.query.subtab));

const currentTabLoading = computed(() =>
  activeMainTab.value === "nfts" ? nftsLoading.value : badgesLoading.value
);

const updateMainTab = (tab: "badges" | "nfts") => {
  activeMainTab.value = tab;
  router.replace({ query: { ...route.query, tab } });
};

watch(activeSubTab, (subtab) => {
  router.replace({ query: { ...route.query, subtab } });
});

watch(
  () => route.query.tab,
  (newTab) => {
    activeMainTab.value = parseMainTab(newTab);
  }
);

watch(
  () => route.query.subtab,
  (newSubTab) => {
    activeSubTab.value = parseSubTab(newSubTab);
  }
);

onMounted(() => {
  // Normalize URL so the page never ends up blank due to weird query shapes (e.g. tab[]=badges)
  const normalizedTab = activeMainTab.value;
  const normalizedSubtab = activeSubTab.value ?? "owned";

  const currentTab = firstQueryValue(route.query.tab);
  const currentSubtab = firstQueryValue(route.query.subtab);

  if (currentTab !== normalizedTab || currentSubtab !== normalizedSubtab) {
    router.replace({
      query: {
        ...route.query,
        tab: normalizedTab,
        subtab: normalizedSubtab,
      },
    });
  }
});

// $fetch rather than useFetch: this runs on demand (tab switch), outside setup.
const fetchNFTs = async () => {
  const url = `/api/nft/owned?chain_id=${useChain.chain.id}&wallet_address=${user.user?.evm_chain_address}`;
  try {
    const res = await $fetch<{
      success: boolean;
      message: string;
      data: { nfts: NFT[] };
    }>(url);
    if (res?.success) {
      nfts.value = res.data.nfts as NFT[];
    } else {
      console.error("获取NFT失败：", res?.message || "未知错误");
    }
  } catch (error) {
    console.error("获取NFT失败：", error);
  }
};

// One request for all three badge tabs — see server/api/badge/summary.get.ts.
const fetchBadges = async () => {
  badgesLoading.value = true;
  const url = `/api/badge/summary?chain_id=${useChain.chain.id}&wallet_address=${user.user?.evm_chain_address}`;
  try {
    const res = await $fetch<{
      success: boolean;
      message: string;
      data: { owned: Badge[]; pending: Badge[]; badge_classes: BadgeClass[] } | null;
    }>(url);
    if (res?.success && res.data) {
      ownedBadges.value = res.data.owned;
      pendingBadges.value = res.data.pending;
      badgeClasses.value = res.data.badge_classes;
    } else {
      console.error("获取徽章失败：", res?.message || "未知错误");
    }
  } catch (error) {
    console.error("获取徽章失败：", error);
  } finally {
    badgesLoading.value = false;
  }
};

// Loaded lazily the first time the NFTs tab is opened.
const loadNFTs = async () => {
  if (nftsLoaded.value || nftsLoading.value) return;
  nftsLoading.value = true;
  try {
    await fetchNFTs();
    nftsLoaded.value = true;
  } finally {
    nftsLoading.value = false;
  }
};

watch(
  activeMainTab,
  (tab) => {
    if (tab === "nfts") loadNFTs();
  },
  { immediate: true }
);

fetchBadges();
</script>

<style scoped></style>
