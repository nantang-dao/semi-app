<template>
  <div class="flex flex-col container-size rounded-xl bg-[var(--ui-bg)] shadow-lg p-4">
    <UButton color="neutral" variant="ghost" class="self-start mb-4" @click="handleBack">
      {{ i18n.text["Back"] }}
    </UButton>
    <div class="flex flex-col items-center justify-center h-full gap-4 pb-8 w-[80%] mx-auto">
      <h1 class="text-2xl font-bold mb-2">{{ i18n.text["Import Wallet"] }}</h1>
      <div class="flex flex-col gap-6 w-full" v-if="step === 1">
        <UForm :state="formState" @submit="toStep2" class="w-full">
          <UFormField name="private" :label="i18n.text['Enter Private Key']" class="w-full">
            <UTextarea
              v-model="formState.privateKey"
              :placeholder="i18n.text['Private Key Placeholder']"
              class="w-full"
            />
          </UFormField>
          <UButton
            type="submit"
            color="primary"
            class="w-full mt-4 flex justify-center items-center"
            size="xl"
            :loading="loading"
            :disabled="loading"
          >
            {{ i18n.text["Next"] }}
          </UButton>
        </UForm>
      </div>

      <div class="flex flex-col gap-6 w-full" v-if="step === 2">
        <UForm :state="formState" @submit="toStep3" class="w-full">
          <UFormField name="safe" :label="i18n.text['Smart Wallet Address']" class="w-full">
            <UTextarea
              v-model="previewWallet.safeAccount"
              :placeholder="i18n.text['Private Key Placeholder']"
              class="w-full"
              readonly
            />
          </UFormField>
          <div class="flex flex-col gap-2">
            <span class="text-sm text-gray-500 mt-2">{{
              i18n.text["Please confirm the smart wallet address to import"]
            }}</span>
          </div>
          <div class="flex justify-center gap-4">
            <UButton
              type="submit"
              color="neutral"
              class="w-full mt-4 flex justify-center items-center"
              size="xl"
              :disabled="loading"
              @click="toStep1"
            >
              {{ i18n.text["Previous"] }}
            </UButton>
            <UButton
              type="submit"
              color="primary"
              class="w-full mt-4 flex justify-center items-center"
              size="xl"
              :loading="loading"
              :disabled="loading"
            >
              {{ i18n.text["Next"] }}
            </UButton>
          </div>
        </UForm>
      </div>

      <div class="flex flex-col gap-6 w-full" v-if="step === 3">
        <UForm :state="formState" @submit="step = 4" class="w-full">
          <UFormField name="safe" :label="i18n.text['Set 6-digit Payment Code']" class="w-full">
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
          <div class="flex justify-center gap-4">
            <UButton
              type="submit"
              color="neutral"
              class="w-full mt-4 flex justify-center items-center"
              size="xl"
              :disabled="loading"
              @click="step = 2"
            >
              {{ i18n.text["Previous"] }}
            </UButton>
            <UButton
              type="submit"
              color="primary"
              class="w-full mt-4 flex justify-center items-center"
              size="xl"
              :loading="loading"
              :disabled="loading"
            >
              {{ i18n.text["Next"] }}
            </UButton>
          </div>
        </UForm>
      </div>

      <div class="flex flex-col gap-6 w-full" v-if="step === 4">
        <UForm :state="formState" @submit="handleImport" class="w-full">
          <UFormField name="safe" :label="i18n.text['Confirm Password']" class="w-full">
            <UPinInput
              variant="subtle"
              type="number"
              v-model="formState.pinConfirm"
              :length="6"
              size="xl"
              class="w-full"
              :ui="{ base: 'w-full' }"
              :disabled="loading"
              mask
            />
          </UFormField>
          <div class="flex flex-col gap-2">
            <span class="text-sm text-gray-500 mt-2">{{ i18n.text["Enter password again"] }}</span>
          </div>
          <div class="flex justify-center gap-4">
            <UButton
              type="submit"
              color="neutral"
              class="w-full mt-4 flex justify-center items-center"
              size="xl"
              :disabled="loading"
              @click="backToStep3"
            >
              {{ i18n.text["Previous"] }}
            </UButton>
            <UButton
              type="submit"
              color="primary"
              class="w-full mt-4 flex justify-center items-center"
              size="xl"
              :loading="loading"
              :disabled="loading"
            >
              {{ i18n.text["Import"] }}
            </UButton>
          </div>
        </UForm>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useUserStore } from "~/stores/user";
import { useI18n } from "~/stores/i18n";
import { useChainStore } from "~/stores/chain";
import { predictSafeAccountAddress } from "~/utils/SafeSmartAccount";
import { setEncryptedKeys } from "~/utils/semi_api";
import { privateKeyToAddress, encryptToKeystore, isPrivateKey } from "semi-core/keys";

const router = useRouter();
const userStore = useUserStore();
const i18n = useI18n();
const toast = useToast();
const chainStore = useChainStore();

const loading = ref(false);
const step = ref(1);
const formState = reactive({
  privateKey: "",
  pin: Array(6).fill(""),
  pinConfirm: Array(6).fill(""),
});
const previewWallet = ref({
  eoa: "",
  safeAccount: "",
});

const handleBack = async () => {
  router.push("/init");
};

const toStep1 = async () => {
  step.value = 1;
  previewWallet.value = {
    eoa: "",
    safeAccount: "",
  };
};

const backToStep3 = async () => {
  step.value = 3;
  formState.pinConfirm = Array(6).fill("");
};

const toStep2 = async () => {
  loading.value = true;
  const validation = isPrivateKey(formState.privateKey);
  if (!validation) {
    toast.add({
      title: i18n.text["Private key format error"],
      color: "error",
    });
    loading.value = false;
    return;
  }

  const eoa = privateKeyToAddress(formState.privateKey as `0x${string}`);
  const safeAccount = await predictSafeAccountAddress({
    owner: eoa,
    chain: chainStore.chain,
  });

  previewWallet.value = {
    eoa,
    safeAccount,
  };

  loading.value = false;
  step.value = 2;
};

const toStep3 = async () => {
  if (previewWallet.value.eoa && previewWallet.value.safeAccount) {
    step.value = 3;
  } else {
    toast.add({
      title: i18n.text["Please enter private key first"],
      color: "error",
    });
  }
};

const handleImport = async () => {
  const password = formState.pin.join("");

  if (password !== formState.pinConfirm.join("")) {
    toast.add({
      title: i18n.text["Passwords do not match"],
      color: "error",
    });
    return;
  }

  if (password.length !== 6) {
    toast.add({
      title: i18n.text["Please enter payment code"],
      color: "error",
    });
    return;
  }

  loading.value = true;
  try {
    const keystore = await encryptToKeystore(formState.privateKey, formState.pin.join(""));
    const opts = {
      id: userStore.user!.id,
      encrypted_keys: JSON.stringify(keystore),
      evm_chain_active_key: previewWallet.value.eoa,
      evm_chain_address: previewWallet.value.safeAccount,
    };
    console.log("[import] options", opts);
    const response = await setEncryptedKeys(opts);

    if (response.result === "ok") {
      // 更新用户信息
      await userStore.getUser(true);
      toast.add({
        title: i18n.text["Import Success"],
        description: i18n.text["Wallet and payment code have been set up successfully"],
        color: "success",
      });
      router.push("/");
    } else {
      throw new Error(i18n.text["Setup Failed"]);
    }
  } catch (error) {
    console.error("[import] error", error);
    toast.add({
      title: i18n.text["Setup Failed"],
      description: i18n.text["Please try again later"],
      color: "error",
    });
  } finally {
    loading.value = false;
  }
};
</script>
