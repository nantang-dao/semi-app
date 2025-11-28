<template>
    <UModal :title="i18n.text['NFT Details']" :dismissible="false" v-model:open="showModal">
      <div
        @click="showModal = true"
        class="flex flex-col items-center justify-center bg-muted rounded-lg p-4 overflow-hidden gap-2 relative cursor-pointer hover:bg-muted/80 transition-colors"
      >
        <div class="flex items-center justify-center bg-gray-500 rounded-lg overflow-hidden w-full aspect-square">
          <img 
            :src="nft.image || '/images/placeholder.png'" 
            class="w-full h-full object-cover" 
            :alt="nft.name"
            @error="handleImageError"
          />
        </div>
        <div class="max-w-full text-xs font-bold whitespace-nowrap overflow-hidden text-ellipsis text-center">
          {{ nft.name }}
        </div>
      </div>
  
      <template #body>
        <div class="flex flex-col gap-4 w-full">
          <!-- 基础信息 -->
          <div class="flex flex-col items-center gap-4">
            <div
              class="w-32 h-32 rounded-lg overflow-hidden bg-gray-500 my-2 flex items-center justify-center"
            >
              <img
                :src="nft.image || '/images/placeholder.png'"
                alt="NFT image"
                class="object-cover w-full h-full"
                @error="handleImageError"
              />
            </div>
            <div class="text-2xl font-bold text-center">{{ nft.name }}</div>
            <div class="text-sm text-gray-500 text-center" v-if="nft.description">
              {{ nft.description }}
            </div>
          </div>

          <!-- 标签页 -->
          <UTabs :items="tabs" v-model="activeTab" class="w-full">
            <template #info>
              <!-- 基础信息标签页 -->
              <div class="flex flex-col gap-2 w-full bg-muted p-2 rounded-lg">
                <div class="flex flex-row items-start justify-between gap-2">
                  <div class="font-bold text-xs text-gray-500 whitespace-nowrap min-w-22">
                    {{ i18n.text["Contract Address"] }}
                  </div>
                  <div class="break-all text-xs text-right">
                    {{ nft.contractAddress }}
                    <div>
                      <span
                        class="py-0 p-1 inline-flex items-center ml-2 flex-1 justify-center text-blue-500 text-xs cursor-pointer hover:underline"
                        @click="toExplorer(nft.contractAddress, 'address')"
                      >
                        {{ i18n.text["Block Explorer"] }}
                      </span>
                      <span
                        class="py-0 p-1 inline-flex items-center ml-2 flex-1 justify-center text-blue-500 text-xs cursor-pointer hover:underline"
                        @click="handleCopy(nft.contractAddress)"
                      >
                        {{ i18n.text["Copy"] }}
                      </span>
                    </div>
                  </div>
                </div>
                <div class="flex flex-row items-start justify-between gap-2">
                  <div class="font-bold text-xs text-gray-500 whitespace-nowrap min-w-22">
                    {{ i18n.text["Token ID"] }}
                  </div>
                  <div class="text-xs break-all text-right">
                    {{ nft.tokenId }}
                  </div>
                </div>
                <div class="flex flex-row items-start justify-between gap-2">
                  <div class="font-bold text-xs text-gray-500 whitespace-nowrap min-w-22">
                    {{ i18n.text["Token Standard"] }}
                  </div>
                  <div class="text-xs text-right">
                    {{ nft.tokenType }}
                  </div>
                </div>
                <div class="flex flex-row items-start justify-between gap-2" v-if="nft.collectionName">
                  <div class="font-bold text-xs text-gray-500 whitespace-nowrap min-w-22">
                    {{ i18n.text["Collection"] }}
                  </div>
                  <div class="text-xs text-right">
                    {{ nft.collectionName }}
                  </div>
                </div>
              </div>

              <!-- Attributes -->
              <div v-if="nft.attributes && Object.keys(nft.attributes).length > 0" class="w-full mt-4">
                <h3 class="text-lg font-bold mb-3">{{ i18n.text["Attributes"] }}</h3>
                <div class="grid grid-cols-1 gap-2 bg-muted p-3 rounded-lg">
                  <div 
                    v-for="(value, key) in nft.attributes" 
                    :key="key"
                    class="flex flex-row items-start justify-between gap-2 p-2 bg-background rounded"
                  >
                    <div class="font-bold text-xs text-gray-500 min-w-24">{{ key }}</div>
                    <div class="text-sm text-right break-all flex-1">
                      <a 
                        v-if="typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'))"
                        :href="value"
                        target="_blank"
                        class="text-blue-500 hover:underline"
                      >
                        {{ value }}
                      </a>
                      <span v-else>{{ value }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Metadata -->
              <div v-if="nft.rawMetadata" class="w-full mt-4">
                <div class="flex items-center justify-between mb-2">
                  <h3 class="text-lg font-bold">{{ i18n.text["Metadata"] }}</h3>
                  <UButton size="xs" variant="ghost" @click="showMetadata = !showMetadata">
                    {{ showMetadata ? i18n.text["Hide Metadata"] : i18n.text["Show Metadata"] }}
                  </UButton>
                </div>
                <div v-if="showMetadata" class="bg-muted p-3 rounded-lg overflow-auto max-h-64">
                  <pre class="text-xs">{{ JSON.stringify(nft.rawMetadata, null, 2) }}</pre>
                </div>
              </div>
            </template>

            <template #transfers>
              <!-- Transfers 标签页 -->
              <div class="w-full">
                <div v-if="loadingTransfers" class="text-center py-8 text-gray-500">
                  {{ i18n.text["Loading"] }}
                </div>
                <div v-else-if="transfers.length === 0" class="text-center py-8 text-gray-500">
                  {{ i18n.text["No transfers"] }}
                </div>
                <div v-else class="space-y-2">
                  <div 
                    v-for="(transfer, index) in transfers" 
                    :key="index"
                    class="bg-muted p-3 rounded-lg"
                  >
                    <div class="flex justify-between items-start gap-2 text-xs">
                      <div>
                        <div class="text-gray-500">{{ i18n.text["From"] }}</div>
                        <div class="break-all">{{ transfer.from }}</div>
                      </div>
                      <div>
                        <div class="text-gray-500">{{ i18n.text["To"] }}</div>
                        <div class="break-all">{{ transfer.to }}</div>
                      </div>
                    </div>
                    <div class="mt-2 flex gap-4 text-xs text-gray-500">
                      <span @click="toExplorer(transfer.txHash, 'tx')" class="text-blue-500 hover:underline cursor-pointer">
                        {{ i18n.text["Transaction Hash"] }}: {{ transfer.txHash.slice(0, 10) }}...
                      </span>
                      <span>{{ i18n.text["Block Number"] }}: {{ transfer.blockNumber }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <template #holders>
              <!-- Holders 标签页 -->
              <div class="w-full">
                <div v-if="loadingHolders" class="text-center py-8 text-gray-500">
                  {{ i18n.text["Loading"] }}
                </div>
                <div v-else-if="holders.length === 0" class="text-center py-8 text-gray-500">
                  {{ i18n.text["No holders"] }}
                </div>
                <div v-else class="space-y-2">
                  <div 
                    v-for="(holder, index) in holders" 
                    :key="index"
                    class="bg-muted p-3 rounded-lg flex justify-between items-center"
                  >
                    <div class="break-all text-sm">{{ holder.address }}</div>
                    <div class="text-xs text-gray-500 ml-4">{{ i18n.text["Quantity"] }}: {{ holder.quantity }}</div>
                  </div>
                </div>
              </div>
            </template>
          </UTabs>
        </div>
      </template>
  
      <template #footer>
        <div class="flex justify-center gap-4 w-full">
          <UButton color="neutral" size="xl" class="flex-1 justify-center" @click="showModal = false">
            {{ i18n.text["Close"] }}
          </UButton>
        </div>
      </template>
    </UModal>
  </template>
  
<script setup lang="ts">
import type { NFT } from "@/server/utils/nft";
import type { TabsItem } from "@nuxt/ui";

const props = defineProps<{
  nft: NFT;
}>();

const i18n = useI18n();
const useChain = useChainStore();
const toast = useToast();
const showModal = ref(false);
const imageError = ref(false);
const showMetadata = ref(false);
const activeTab = ref(0);

// Transfers 和 Holders 数据
const transfers = ref<any[]>([]);
const holders = ref<any[]>([]);
const loadingTransfers = ref(false);
const loadingHolders = ref(false);

// 标签页配置
const tabs = computed<TabsItem[]>(() => {
  const items: TabsItem[] = [
    { label: i18n.text["Info"] || "信息", slot: "info" },
    { label: i18n.text["Transfers"], slot: "transfers" },
  ];
  
  // ERC1155 显示 Holders 标签页
  if (props.nft.tokenType === "ERC1155") {
    items.push({ label: i18n.text["Holders"], slot: "holders" });
  }
  
  return items;
});

// 监听标签页切换，按需加载数据
watch(activeTab, (newTab) => {
  const tabSlot = tabs.value[newTab]?.slot;
  
  if (tabSlot === "transfers" && transfers.value.length === 0 && !loadingTransfers.value) {
    fetchTransfers();
  }
  
  if (tabSlot === "holders" && holders.value.length === 0 && !loadingHolders.value) {
    fetchHolders();
  }
});

// 获取转账历史
const fetchTransfers = async () => {
  loadingTransfers.value = true;
  try {
    const { data } = await useFetch(
      `/api/nft/${props.nft.contractAddress}/${props.nft.tokenId}/transfers?chain_id=${useChain.chain.id}`
    );
    if (data.value?.success) {
      transfers.value = data.value.data.transfers;
    }
  } catch (error) {
    console.error("获取转账历史失败:", error);
  } finally {
    loadingTransfers.value = false;
  }
};

// 获取持有者
const fetchHolders = async () => {
  loadingHolders.value = true;
  try {
    const { data } = await useFetch(
      `/api/nft/${props.nft.contractAddress}/${props.nft.tokenId}/holders?chain_id=${useChain.chain.id}`
    );
    if (data.value?.success) {
      holders.value = data.value.data.holders;
    }
  } catch (error) {
    console.error("获取持有者失败:", error);
  } finally {
    loadingHolders.value = false;
  }
};

const handleImageError = () => {
  imageError.value = true;
};

const toExplorer = (address: string, type: "address" | "tx" = "address") => {
  const url = useChain.chain.blockExplorers?.default?.url;
  window.open(`${url}/${type}/${address}`, "_blank");
};

const handleCopy = (text: string) => {
  navigator.clipboard.writeText(text);
  toast.add({
    title: i18n.text["Copy Success"],
    description: "",
    color: "success",
  });
};
</script>

<style scoped></style>