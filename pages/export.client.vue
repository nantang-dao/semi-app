<template>
  <div class="flex flex-col container-size rounded-xl bg-[var(--ui-bg)] shadow-lg p-4">
    <UButton
      icon="i-heroicons-arrow-left"
      color="neutral"
      variant="ghost"
      class="self-start mb-4"
      @click="handleBack"
    >
      {{ i18n.text["Back"] }}
    </UButton>
    <div class="flex flex-col items-center justify-center h-full gap-4 py-8 w-[80%] mx-auto">
      <template v-if="!showPrivateKey">
        <h1 class="text-2xl font-bold">
          {{ i18n.text["Export Private Key"] }}
        </h1>
        <div class="text-center text-gray-600">
          {{ i18n.text["Enter your login password to verify your identity"] }}
        </div>
        <UForm :state="formState" @submit="onSubmit" class="w-full">
          <UFormField name="pin">
            <UPinInput
              variant="subtle"
              type="number"
              v-model="formState.pin"
              :length="6"
              size="xl"
              class="w-full"
              :ui="{ base: 'w-full' }"
              :disabled="loading"
              mask
            />
          </UFormField>
          <div class="flex gap-4 mt-4">
            <UButton
              type="submit"
              color="primary"
              :class="['flex-1 flex justify-center items-center', 'w-full']"
              size="xl"
              :loading="loading"
              :disabled="loading || !isPinComplete"
            >
              {{ i18n.text["Export Private Key"] }}
            </UButton>
          </div>
        </UForm>
      </template>
      <template v-else>
        <h1 class="text-2xl font-bold">{{ i18n.text["Your Private Key"] }}</h1>
        <div class="w-full flex flex-col gap-2">
          <UTextarea v-model="privateKey" readonly :rows="3" class="w-full" />
          <UButton
            icon="i-heroicons-clipboard"
            color="primary"
            class="w-full justify-center"
            size="xl"
            @click="copyPrivateKey"
          >
            {{ i18n.text["Copy"] }}
          </UButton>
        </div>
        <div class="bg-red-50 border border-red-200 rounded-lg p-2 w-full">
          <h3 class="text-red-800 font-semibold mb-2 flex items-center gap-1">
            <UIcon name="ci:error-outline" />{{ i18n.text["Security Warning"] }}
          </h3>
          <ul class="text-red-700 text-sm space-y-2">
            <li>
              {{
                i18n.text[
                  "Private key is the only credential to access your account. Do not share it with anyone. Once the private key is leaked, your assets may be at risk of theft"
                ]
              }}
            </li>
          </ul>
        </div>

        <div class="bg-red-50 border border-yellow-200 rounded-lg p-2 w-full">
          <h3 class="text-yellow-800 font-semibold mb-2 flex items-center gap-1">
            <UIcon name="ci:error-outline" />{{ i18n.text["Note"] }}
          </h3>
          <ul class="text-yellow-700 text-sm space-y-2">
            <li>
              {{
                i18n.text[
                  "This private key belongs to the wallet that owns the current smart wallet, not the current smart wallet itself. For details, please refer to"
                ]
              }}
              <a
                href="https://docs.safe.global/advanced/erc-4337/overview"
                target="_blank"
                class="text-blue-500"
                >{{ i18n.text["ERC-4337 standard"] }}</a
              >。
            </li>
          </ul>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useUserStore } from "~/stores/user";
import { useI18n } from "~/stores/i18n";
import { keystoreToPrivateKey } from "semi-core/keys";

const router = useRouter();
const userStore = useUserStore();
const i18n = useI18n();
const loading = ref(false);
const showPrivateKey = ref(false);
const privateKey = ref("");
const toast = useToast();

const formState = reactive({
  pin: Array(6).fill(""),
});

const isPinComplete = computed(() => {
  return formState.pin.length === 6 && formState.pin.every((digit) => digit !== "");
});

const onSubmit = async () => {
  loading.value = true;
  try {
    const user = userStore.user;
    if (!user?.encrypted_keys) {
      throw new Error(i18n.text["No encrypted key information found"]);
    }

    // 获取私钥
    privateKey.value = await keystoreToPrivateKey(
      JSON.parse(user.encrypted_keys),
      formState.pin.join("")
    );
    console.log("privateKey", privateKey.value);
    showPrivateKey.value = true;
  } catch (error) {
    console.error("验证失败:", error);
    toast.add({
      title: i18n.text["Verification Failed"],
      description: i18n.text["Incorrect password or invalid key information"],
      color: "error",
    });
  } finally {
    loading.value = false;
  }
};

const handleBack = () => {
  router.push("/");
};

const copyPrivateKey = async () => {
  try {
    await navigator.clipboard.writeText(privateKey.value);
    toast.add({
      title: i18n.text["Copy Success"],
      description: i18n.text["Private key has been copied to clipboard"],
      color: "success",
    });
  } catch (error) {
    toast.add({
      title: i18n.text["Copy Failed"],
      description: i18n.text["Please copy the private key manually"],
      color: "error",
    });
  }
};
</script>
