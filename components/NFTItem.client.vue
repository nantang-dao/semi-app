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

          <!-- 基础信息 -->
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

const props = defineProps<{
  nft: NFT;
}>();

const i18n = useI18n();
const useChain = useChainStore();
const toast = useToast();
const showModal = ref(false);
const imageError = ref(false);

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