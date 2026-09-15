<template>
  <div>
    <UButton
      icon="ci:notebook"
      color="neutral"
      variant="subtle"
      size="xl"
      class="text-2xl cursor-pointer"
      @click="showModal = true"
    />

    <!-- 联系人列表对话框 -->
    <UModal v-model:open="showModal" :title="i18n.text['Contacts']">
      <template #body>
        <!-- 加载骨架屏幕 -->
        <div class="flex flex-col gap-4" v-if="loading">
          <div class="w-full h-13 rounded-lg loading-bg" v-for="i in 6" :key="i"></div>
        </div>

        <!-- 空状态 -->
        <div
          v-else-if="!loading && contacts.length === 0"
          class="flex flex-col items-center justify-center gap-2 py-12"
        >
          <UIcon name="ci:notebook" class="text-green-500/50 text-[90px]" />
          <div class="text-gray-500">{{ i18n.text["No Contacts"] }}</div>
        </div>

        <!-- 联系人列表 -->
        <div class="flex flex-col gap-3 max-h-[60vh] overflow-y-auto" v-else>
          <div
            v-for="(contact, index) in contacts"
            :key="index"
            class="w-full flex items-center justify-between p-2 px-3 rounded-lg bg-muted hover:bg-muted/80 transition-colors cursor-pointer"
            @click="handleSelectContact(contact)"
          >
            <div class="flex flex-col flex-1 gap-1">
              <!-- 第一行：memo -->
              <div class="font-medium text-base  break-all">{{ contact.memo || "-" }}</div>
              <!-- 第二行：chain icon 和 address -->
              <div class="flex items-center gap-2">
                <img
                  :src="getChainIcon(contact.chain)"
                  :alt="contact.chain"
                  class="w-5 h-5 rounded-full"
                  @error="handleImageError"
                />
                <span class="text-sm text-gray-400 font-mono break-all">{{ contact.address }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end w-full">
          <UButton color="neutral" size="xl" @click="showModal = false">
            {{ i18n.text["Cancel"] }}
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { useUserStore } from "~/stores/user";
import { useI18n } from "~/stores/i18n";
import { getContacts, type Contact } from "~/utils/semi_api";
import { chainMap } from "~/stores/chain";
import { sepolia, optimism, mainnet, arbitrum } from "viem/chains";

const userStore = useUserStore();
const i18n = useI18n();
const toast = useToast();

const showModal = ref(false);
const loading = ref(false);
const contacts = ref<Contact[]>([]);

// 定义 emit
const emit = defineEmits<{
  onSelect: [address: string];
}>();

// 根据链名称或ID获取图标
const getChainIcon = (chain: string): string => {
  // 尝试通过链ID匹配
  const chainId = Number(chain);
  if (!isNaN(chainId) && chainMap[chainId]) {
    return chainMap[chainId].icon;
  }

  // 尝试通过链名称匹配
  const chainName = chain.toLowerCase();
  if (chainName.includes("optimism")) {
    return chainMap[optimism.id].icon;
  }
  if (chainName.includes("ethereum") && chainName.includes("mainnet")) {
    return chainMap[mainnet.id].icon;
  }
  if (chainName.includes("arbitrum")) {
    return chainMap[arbitrum.id].icon;
  }
  if (chainName.includes("sepolia")) {
    return chainMap[sepolia.id].icon;
  }

  // 默认返回 Optimism 图标
  return chainMap[optimism.id].icon;
};

// 处理图片加载错误
const handleImageError = (event: Event) => {
  const img = event.target as HTMLImageElement;
  img.src = chainMap[optimism.id].icon; // 使用默认图标
};

// 加载联系人列表
const loadContacts = async () => {
  if (!userStore.user?.id) {
    loading.value = false;
    return;
  }

  try {
    loading.value = true;
    const response = await getContacts(userStore.user.id);
    contacts.value = response.contacts || [];
  } catch (error) {
    console.error("Failed to load contacts:", error);
    toast.add({
      title: i18n.text["Failed to load contacts"],
      color: "error",
    });
    contacts.value = [];
  } finally {
    loading.value = false;
  }
};

// 选择联系人
const handleSelectContact = (contact: Contact) => {
  emit("onSelect", contact.address);
  showModal.value = false;
};

// 监听对话框打开，加载联系人列表
watch(showModal, (newValue) => {
  if (newValue) {
    loadContacts();
  }
});
</script>

