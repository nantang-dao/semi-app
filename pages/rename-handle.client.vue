<template>
  <div class="flex flex-col container-size rounded-xl bg-[var(--ui-bg)] shadow-lg p-4">
    <UButton
      icon="i-heroicons-arrow-left"
      color="neutral"
      variant="ghost"
      class="self-start mb-4"
      @click="router.back()"
    >
      {{ i18n.text["Back"] }}
    </UButton>

    <div class="flex flex-col items-center justify-center h-full gap-4 pb-8 w-[80%] mx-auto">
      <h1 class="text-2xl font-bold">{{ i18n.text["Rename Username"] }}</h1>

      <div class="w-full text-sm text-gray-500 space-y-1">
        <p>{{ i18n.text["Current username"] }}: <span class="text-gray-800 font-medium">@{{ userStore.user?.handle }}</span></p>
        <p v-if="userStore.user?.handle_changed_at">
          {{ i18n.text["Last renamed"] }}: {{ formatTime(userStore.user.handle_changed_at) }}
        </p>
      </div>

      <UForm :state="formState" @submit="onSubmit" class="w-full">
        <UFormField name="handle">
          <UInput
            size="xl"
            class="w-full"
            v-model="formState.handle"
            :placeholder="i18n.text['Please enter username']"
            :ui="{ base: 'w-full' }"
            :disabled="loading || !canRename"
            variant="subtle"
          />
        </UFormField>
        <div class="text-sm text-gray-500 mt-2">
          {{ i18n.text["Length between 6-30 characters"] }}
        </div>
        <div class="text-sm text-gray-500">
          {{ i18n.text["Only letters, numbers, underscores and hyphens are allowed"] }}
        </div>
        <div class="text-sm text-gray-500">
          {{ i18n.text["Cannot be all numbers"] }}
        </div>
        <div class="text-sm text-gray-500">
          {{ i18n.text["Rename once every 30 days"] }}
        </div>
        <div v-if="nextRenameAt && !canRename" class="text-sm text-amber-600">
          {{ nextRenameCountdownText }}
        </div>
        <UButton
          type="submit"
          color="primary"
          class="w-full mt-4 flex justify-center items-center"
          size="xl"
          :loading="loading"
          :disabled="loading || !canRename || !formState.handle"
        >
          {{ i18n.text["Confirm"] }}
        </UButton>
      </UForm>
    </div>
  </div>
</template>

<script setup lang="ts">
import dayjs from "dayjs";
import { setHandle, getUserByHandle } from "~/utils/semi_api";

const router = useRouter();
const loading = ref(false);
const toast = useToast();
const userStore = useUserStore();
const i18n = useI18n();

const formState = reactive({ handle: "" });

const nextRenameAt = computed(() => userStore.user?.next_rename_at || null);
const canRename = computed(() => {
  if (!nextRenameAt.value) return true;
  return new Date(nextRenameAt.value) <= new Date();
});

const formatRenameTime = (value: string) => dayjs(value).format("YYYY-MM-DD HH:mm");

const formatTime = (value: string) => formatRenameTime(value);

const nextRenameCountdownText = computed(() => {
  if (!nextRenameAt.value) return "";
  return i18n.text["Time until next rename available"].replace(
    "{time}",
    formatRenameTime(nextRenameAt.value)
  );
});

const validateHandle = (value: string) => {
  if (!value) return i18n.text["Please enter username first"];
  if (value.length < 6) return i18n.text["Username must be at least 6 characters"];
  if (value.length > 30) return i18n.text["Username cannot exceed 30 characters"];
  if (!/^[a-zA-Z0-9_-]+$/.test(value))
    return i18n.text["Username can only contain letters, numbers, underscores and hyphens"];
  if (/^\d+$/.test(value)) return i18n.text["Username cannot be all numbers"];
  return true;
};

onMounted(async () => {
  await userStore.getUser(true);
  if (!userStore.user?.handle) {
    router.replace("/set-name");
  }
});

const onSubmit = async () => {
  loading.value = true;
  try {
    const validation = validateHandle(formState.handle);
    if (validation !== true) {
      toast.add({ title: i18n.text["Please enter correct username"], description: validation, color: "error" });
      return;
    }

    if (formState.handle === userStore.user?.handle) {
      toast.add({ title: i18n.text["Handle unchanged"], color: "error" });
      return;
    }

    try {
      const existing = await getUserByHandle(formState.handle);
      if (existing.id !== userStore.user!.id) {
        toast.add({
          title: i18n.text["Username already exists"],
          description: i18n.text["Please enter another username"],
          color: "error",
        });
        return;
      }
    } catch {
      // available
    }

    await setHandle(userStore.user!.id, formState.handle);
    await userStore.getUser(true);
    toast.add({ title: i18n.text["Rename success"], color: "success" });
    router.push("/");
  } catch (error: any) {
    toast.add({
      title: i18n.text["Rename failed"],
      description: error?.message || i18n.text["Please try again later"],
      color: "error",
    });
  } finally {
    loading.value = false;
  }
};
</script>
