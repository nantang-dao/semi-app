<template>
  <div class="flex flex-col container-size rounded-xl bg-[var(--ui-bg)] shadow-lg p-4 min-h-[80vh]">
    <UButton icon="i-heroicons-arrow-left" color="neutral" variant="ghost" class="self-start mb-4"
      @click="router.push('/')">
      {{ i18n.text["Back"] }}
    </UButton>

    <div class="flex items-center justify-between mb-4">
      <div class="flex flex-col gap-1">
        <h1 class="text-2xl font-bold">{{ i18n.text["Contacts"] }}</h1>
        <div v-if="userStore.user?.handle" class="text-sm text-gray-500 flex items-center gap-1">
          <UIcon name="ci:user" size="14" />
          <span>{{ i18n.text["Handle"] }}: {{ userStore.user.handle }}</span>
        </div>
      </div>
      <UButton color="primary" variant="ghost" @click="addContact"
        class="flex items-center gap-1 text-sm text-primary hover:underline">
        {{ i18n.text["Add Contact"] }}
        <UIcon name="ci:add-plus-square" size="20" />
      </UButton>
    </div>


    <!-- 加载骨架屏幕 -->
    <div class="flex flex-col gap-4" v-if="loading">
      <div class="w-full h-16 rounded-lg loading-bg" v-for="i in 5" :key="i"></div>
    </div>

    <!-- 空状态 -->
    <div v-else-if="!loading && contacts.length === 0" class="flex flex-col items-center justify-center gap-2 my-12">
      <UIcon name="ci:notebook" class="text-green-500/50 text-[90px]" />
      <div class="text-gray-500">{{ i18n.text["No Contacts"] }}</div>
    </div>

    <!-- 联系人列表 -->
    <div class="flex flex-col gap-3 flex-1 overflow-y-auto" v-else>
      <div v-for="(contact, index) in contacts" :key="index"
        class="w-full flex justify-between gap-2 py-2 px-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors">
        <div class="flex flex-col flex-1 gap-1">
          <!-- 第一行：memo -->
          <div class="font-medium text-base">{{ contact.memo || "-" }}</div>
          <!-- 第二行：chain icon 和 address -->
          <div class="flex items-center gap-2">
            <img :src="getChainIcon(contact.chain)" :alt="contact.chain" class="w-5 h-5 rounded-full"
              @error="handleImageError" />
            <span class="text-sm text-gray-400 font-mono break-all">{{ contact.address }}</span>
          </div>
        </div>
        <!-- 删除按钮 -->
        <div class="flex flex-col gap-2">
          <UButton color="error" variant="outline" size="sm" @click.stop="handleDeleteClick(index)"
            class="text-sm px-2 py-2">
            <UIcon name="ci:trash-full" size="18" />
          </UButton>
          <UButton variant="outline" size="sm" @click.stop="navigateTo(`/transfer?to=${contact.address}`)"
            class="text-sm px-2 py-2">
            <UIcon name="ci:transfer" size="18" />
          </UButton>
        </div>
      </div>
    </div>

    <!-- 添加联系人对话框 -->
    <UModal v-model:open="showAddModal" :title="i18n.text['Add Contact']">
      <template #body>
        <UForm :state="formState" @submit="handleSubmit" class="w-full">
          <UFormField name="memo" :label="i18n.text['Memo']" :error="errors.memo">
            <UInput v-model="formState.memo" :placeholder="i18n.text['Please enter memo']" variant="subtle" size="xl"
              class="w-full" />
          </UFormField>

          <div class="flex items-end gap-2">
            <UFormField name="address" :label="i18n.text['Address']" :error="errors.address" class="mt-4 flex-1">
              <UInput v-model="formState.address" :placeholder="i18n.text['Please enter address']" variant="subtle"
                size="xl" class="w-full" />
            </UFormField>
            <ScanQrcodeBtn @onDetect="handleQrCodeDetect" />
          </div>

          <UFormField name="chain" :label="i18n.text['Chain']" :error="errors.chain" class="mt-4">
            <USelect v-model="formState.chain" :items="chainSelectItems" variant="subtle" size="xl" class="w-full"
              :placeholder="i18n.text['Please select chain']" />
          </UFormField>
        </UForm>
      </template>

      <template #footer>
        <div class="flex justify-end gap-4 w-full">
          <UButton color="neutral" size="xl" @click="handleCancel" :disabled="saving">
            {{ i18n.text["Cancel"] }}
          </UButton>
          <UButton color="primary" size="xl" @click="handleSubmit" :loading="saving" :disabled="saving">
            {{ i18n.text["Confirm"] }}
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- 删除确认对话框 -->
    <UModal v-model:open="showDeleteModal" :title="i18n.text['Delete Contact']">
      <template #body>
        <div class="text-base">
          {{ i18n.text["Are you sure you want to delete this contact?"] }}
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end gap-4 w-full">
          <UButton color="neutral" size="xl" @click="showDeleteModal = false" :disabled="deleting">
            {{ i18n.text["Cancel"] }}
          </UButton>
          <UButton color="error" size="xl" @click="handleDeleteConfirm" :loading="deleting" :disabled="deleting">
            {{ i18n.text["Confirm"] }}
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { useUserStore } from "~/stores/user";
import { useI18n } from "~/stores/i18n";
import { useRouter } from "vue-router";
import { getContacts, setContacts, type Contact } from "~/utils/semi_api";
import { useChainStore, chainMap } from "~/stores/chain";
import { sepolia, optimism, mainnet, arbitrum } from "viem/chains";
import { isAddress } from "viem";

const router = useRouter();
const userStore = useUserStore();
const useChain = useChainStore();
const i18n = useI18n();
const toast = useToast();

const loading = ref(true);
const contacts = ref<Contact[]>([]);
const showAddModal = ref(false);
const saving = ref(false);
const showDeleteModal = ref(false);
const deleting = ref(false);
const deleteIndex = ref<number | null>(null);

// 表单状态
const formState = reactive({
  memo: "",
  address: "",
  chain: useChain.chain.id.toString(),
});

// 表单错误
const errors = reactive({
  memo: "",
  address: "",
  chain: "",
});

// 链选项（用于 USelect）
const chainSelectItems = computed(() => {
  return Object.values(chainMap).map((chain) => ({
    label: chain.name,
    value: chain.id.toString(),
  }));
});

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

// 打开添加联系人对话框
const addContact = () => {
  // 重置表单
  formState.memo = "";
  formState.address = "";
  formState.chain = useChain.chain.id.toString();
  errors.memo = "";
  errors.address = "";
  errors.chain = "";
  showAddModal.value = true;
};

// 取消添加
const handleCancel = () => {
  showAddModal.value = false;
  // 重置表单
  formState.memo = "";
  formState.address = "";
  formState.chain = useChain.chain.id.toString();
  errors.memo = "";
  errors.address = "";
  errors.chain = "";
};

// 验证表单
const validateForm = (): boolean => {
  let isValid = true;

  // 验证 memo
  if (!formState.memo.trim()) {
    errors.memo = i18n.text["Please enter memo"];
    isValid = false;
  } else {
    errors.memo = "";
  }

  // 验证 address
  if (!formState.address.trim()) {
    errors.address = i18n.text["Please enter address"];
    isValid = false;
  } else if (!isAddress(formState.address.trim())) {
    errors.address = i18n.text["Invalid address"];
    isValid = false;
  } else {
    errors.address = "";
  }

  // 验证 chain
  if (!formState.chain) {
    errors.chain = i18n.text["Please select chain"];
    isValid = false;
  } else {
    errors.chain = "";
  }

  return isValid;
};

// 提交表单
const handleSubmit = async () => {
  if (!validateForm()) {
    return;
  }

  if (!userStore.user?.id) {
    toast.add({
      title: i18n.text["User not logged in"],
      color: "error",
    });
    return;
  }

  try {
    saving.value = true;

    // 创建新联系人
    const newContact: Contact = {
      memo: formState.memo.trim(),
      address: formState.address.trim(),
      chain: formState.chain,
    };

    // 合并到现有联系人列表
    const updatedContacts = [...contacts.value, newContact];

    // 调用 API 保存
    await setContacts(userStore.user.id, updatedContacts);

    // 关闭对话框
    showAddModal.value = false;

    // 显示成功提示
    toast.add({
      title: i18n.text["Add Contact Success"],
      description: i18n.text["Contact has been added successfully"],
      color: "success",
    });

    // 重新加载联系人列表
    await loadContacts();
  } catch (error) {
    console.error("Failed to add contact:", error);
    toast.add({
      title: i18n.text["Add Contact Failed"],
      color: "error",
    });
  } finally {
    saving.value = false;
  }
};

// 点击删除按钮
const handleDeleteClick = (index: number) => {
  deleteIndex.value = index;
  showDeleteModal.value = true;
};

// 确认删除
const handleDeleteConfirm = async () => {
  if (deleteIndex.value === null || !userStore.user?.id) {
    showDeleteModal.value = false;
    return;
  }

  try {
    deleting.value = true;

    // 创建更新后的联系人列表（移除要删除的项）
    const updatedContacts = contacts.value.filter((_, index) => index !== deleteIndex.value);

    // 调用 API 保存
    await setContacts(userStore.user.id, updatedContacts);

    // 关闭对话框
    showDeleteModal.value = false;
    deleteIndex.value = null;

    // 显示成功提示
    toast.add({
      title: i18n.text["Delete Contact Success"],
      description: i18n.text["Contact has been deleted successfully"],
      color: "success",
    });

    // 重新加载联系人列表
    await loadContacts();
  } catch (error) {
    console.error("Failed to delete contact:", error);
    toast.add({
      title: i18n.text["Delete Contact Failed"],
      color: "error",
    });
  } finally {
    deleting.value = false;
  }
};

const handleQrCodeDetect = (values: string[]) => {
  if (values.length > 0) {
    const address = values[0];
    if (isAddress(address)) {
      formState.address = address;
    }
  }
};

onMounted(() => {
  loadContacts();
});
</script>
