<template>
  <div class="flex flex-col container-size rounded-xl bg-[var(--ui-bg)] shadow-lg p-4">
    <UButton
      con="i-heroicons-arrow-left"
      color="neutral"
      variant="ghost"
      class="self-start mb-4"
      @click="handleBack"
    >
      {{ i18n.text.Back }}
    </UButton>
    <div class="flex flex-col items-center justify-center h-full gap-4 py-8 w-[80%] mx-auto">
      <h1 class="text-2xl font-bold">{{ i18n.text["Login Password"] }}</h1>
      <div>
        {{
          i18n.text[
            "Please enter 6-digit password. If this is your first login, we will automatically create a user for you."
          ]
        }}
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
            {{ i18n.text.Login }}
          </UButton>
        </div>
      </UForm>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useUserStore } from "~/stores/user";
import { useChainStore } from "~/stores/chain";
import {
  generateMnemonicPhrase,
  getAddressFromMnemonic,
  encryptMnemonicToKeystore,
} from "~/utils/encryption";
import { predictSafeAccountAddress } from "~/utils/SafeSmartAccount";
import { setEncryptedKeys, signinWithPassword, getMe } from "~/utils/semi_api";

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();
const useChain = useChainStore();
const i18n = useI18n();
const loading = ref(false);
const toast = useToast();

definePageMeta({
  layout: "unauth",
});

const phone = computed(() => (route.query.phone as string) || "");

const formState = reactive({
  pin: Array(6).fill(""),
});

const isPinComplete = computed(() => {
  return formState.pin.length === 6 && formState.pin.every((digit) => digit !== "");
});

const createManagerWallet = async (pin: string, userId: string) => {
  try {
    // 第一步：生成助记词和钱包地址
    const mnemonic = generateMnemonicPhrase();
    const evm_chain_active_key = getAddressFromMnemonic(mnemonic);

    // 第二步：生成EVM链地址
    const evm_chain_address = await predictSafeAccountAddress({
      owner: evm_chain_active_key,
      chain: useChain.chain,
    });

    // 第二步：使用pin加密助记词
    const encrypted_keys = await encryptMnemonicToKeystore(mnemonic, pin);

    // 第三步：上传加密后的密钥
    const response = await setEncryptedKeys({
      id: userId,
      encrypted_keys: JSON.stringify(encrypted_keys),
      evm_chain_active_key,
      evm_chain_address,
    });

    if (response.result === "ok") {
      toast.add({
        title: i18n.text["Setup Success"],
        description: i18n.text["Payment code has been set up successfully"],
        color: "success",
      });

      // 更新用户信息
      await userStore.getUser(true);
    } else {
      throw new Error("设置失败");
    }
  } catch (error) {
    console.error("创建钱包失败:", error);
    throw error;
  }
};

const onSubmit = async () => {
  loading.value = true;
  try {
    const { id } = await signinWithPassword(phone.value, formState.pin.join(""));
    const user = await getMe();
    console.log("[user]:", user);
    userStore.setUser(user);
    if (!user.encrypted_keys) {
      await createManagerWallet(formState.pin.join(""), id);
    }

    toast.add({
      title: i18n.text["Login Success"],
      description: i18n.text["Redirecting to homepage"],
      color: "success",
    });
    const redirectParam = route.query.redirect as string;
    await router.push(redirectParam === "oauth" ? "/oauth/authorize" : "/");
  } catch (error) {
    console.error("登录失败:", error);
    toast.add({
      title: i18n.text["Login Failed"],
      description: i18n.text["Please try again later"],
      color: "error",
    });
  } finally {
    loading.value = false;
  }
};

const handleBack = () => {
  const redirectParam = route.query.redirect as string;
  router.push(redirectParam === "oauth" ? "/login?redirect=oauth" : "/login");
};
</script>
