<template>
  <div
    class="flex flex-col container-size h-[100vh] rounded-xl bg-[var(--ui-bg)] shadow-lg px-4 sm:px-8 py-8 banner overflow-hidden"
  >
    <UButton
      icon="i-heroicons-arrow-left"
      color="neutral"
      variant="ghost"
      class="self-start mb-4"
      @click="router.push('/badges')"
    >
      {{ i18n.text["Back"] }}
    </UButton>

    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-bold">{{ i18n.text["Create Badge"] }}</h1>
    </div>

    <div class="flex-1 overflow-y-auto">
      <div v-if="step === 1" class="max-w-2xl mx-auto space-y-8">
        <UForm :state="formState" @submit="handleNext" class="space-y-4">
          <UFormField name="image_url" :label="i18n.text['Badge Image']">
            <div class="flex flex-col gap-3">
              <div
                class="flex flex-col gap-2 ring ring-inset ring-accented rounded-md justify-center items-center"
              >
                <div
                  @click="uploadImage"
                  class="w-26 h-26 rounded-full overflow-hidden bg-elevated my-4 flex items-center justify-center"
                >
                  <img
                    v-if="formState.image_url"
                    :src="formState.image_url"
                    alt="badge image"
                    class="object-cover w-full h-full"
                  />
                  <UIcon name="i-heroicons-photo" class="text-4xl" v-else />
                </div>
              </div>
              <span v-if="errors.image_url" class="text-sm text-error-500">{{
                errors.image_url
              }}</span>
            </div>
          </UFormField>

          <UFormField name="name" :label="i18n.text['Badge Name']">
            <div class="flex flex-col gap-2">
              <UInput
                variant="subtle"
                size="md"
                v-model="formState.name"
                :placeholder="i18n.text['Please enter badge name']"
                @blur="validateField('name')"
              />
              <span v-if="errors.name" class="text-sm text-error-500">{{ errors.name }}</span>
            </div>
          </UFormField>

          <UFormField name="description" :label="i18n.text['Description']">
            <div class="flex flex-col gap-2">
              <UTextarea
                variant="subtle"
                size="md"
                v-model="formState.description"
                :placeholder="i18n.text['Please enter badge description']"
                @blur="validateField('description')"
                :rows="5"
              />
              <span v-if="errors.description" class="text-sm text-error-500">{{
                errors.description
              }}</span>
            </div>
          </UFormField>

          <div class="flex justify-end">
            <UButton
              type="submit"
              color="primary"
              size="lg"
              class="w-full min-w-[160px] justify-center"
              :disabled="isSubmitting"
              :loading="isSubmitting"
            >
              {{ i18n.text["Next"] }}
            </UButton>
          </div>
        </UForm>
      </div>

      <div v-if="step === 2" class="max-w-2xl mx-auto flex flex-col gap-4">
        <div>{{ i18n.text["Input PIN Code"] }}</div>
        <UPinInput
          variant="subtle"
          type="number"
          v-model="pinCode"
          :length="CODE_LENGTH"
          size="xl"
          class="w-full"
          :ui="{ base: 'w-full' }"
          mask
        />
        <div class="flex justify-end gap-4">
          <UButton
            type="submit"
            color="neutral"
            size="lg"
            class="w-full min-w-[160px] justify-center"
            :disabled="isSubmitting"
            @click="step = 1"
          >
            {{ i18n.text["Back"] }}
          </UButton>
          <UButton
            type="submit"
            color="primary"
            size="lg"
            class="w-full min-w-[160px] justify-center"
            :disabled="isSubmitting"
            :loading="isSubmitting"
            @click="handleCreate"
          >
            {{ i18n.text["Create"] }}
          </UButton>
        </div>
        <div v-if="isSubmitting" class="text-sm text-gray-100">
          {{ i18n.text["Create badge may take a few minutes to complete."] }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import type { Profile } from "@/server/api/badge/types";
import { chainContext } from "@/utils/semi_core";

const router = useRouter();
const i18n = useI18n();
const toast = useToast();
const user = useUserStore();
const useChain = useChainStore();

// 常量
const CODE_LENGTH = 6;
const DEFAULT_CODE = Array(CODE_LENGTH).fill("");

const step = ref(1);
const pinCode = ref(DEFAULT_CODE);

const translation = computed<Record<string, string>>(() => i18n.text as Record<string, string>);

const t = (key: string, fallback: string) => translation.value[key] ?? fallback;

interface FormState {
  image_url: string;
  name: string;
  description: string;
}

interface FormErrors {
  image_url: string;
  name: string;
  description: string;
}

const formState = reactive<FormState>({
  image_url: "",
  name: "",
  description: "",
});

const errors = reactive<FormErrors>({
  image_url: "",
  name: "",
  description: "",
});

const isSubmitting = ref(false);

const validateField = (field: keyof FormState) => {
  const value = formState[field].trim();
  switch (field) {
    case "image_url":
      errors.image_url = value ? "" : i18n.text["Please upload badge image"];
      break;
    case "name":
      errors.name = value ? "" : i18n.text["Please enter badge name"];
      break;
    case "description":
      errors.description = value ? "" : i18n.text["Please enter badge description"];
      break;
    default:
      break;
  }
};

const validateForm = () => {
  (Object.keys(formState) as Array<keyof FormState>).forEach((field) => {
    validateField(field);
  });

  return !Object.values(errors).some(Boolean);
};

watch(
  () => formState.image_url,
  () => {
    if (formState.image_url.trim()) {
      errors.image_url = "";
    }
  }
);

watch(
  () => formState.name,
  () => {
    if (formState.name.trim()) {
      errors.name = "";
    }
  }
);

watch(
  () => formState.description,
  () => {
    if (formState.description.trim()) {
      errors.description = "";
    }
  }
);

interface ChooseFileOption {
  accepts?: string[];
  validator?: (file: File) => void;
}

const chooseFile = async (opts?: ChooseFileOption): Promise<File[]> => {
  return new Promise((resolve) => {
    const el = document.createElement("input");
    el.id = "choose-file";
    el.style.position = "absolute";
    el.style.visibility = "hidden";
    el.style.top = "0";
    el.style.left = "0";

    el.type = "file";
    el.accept = opts?.accepts?.join(",") || "";
    el.addEventListener("change", () => {
      if (!el.files?.length) {
        return;
      }

      const files = Array.from(el.files);
      const { validator } = opts || {};
      files.forEach((file) => {
        if (opts?.accepts?.length && !opts.accepts.includes(file.type)) {
          throw new Error("");
        }

        if (validator) {
          validator(file);
        }
      });
      resolve(files);
      el.remove();
    });

    window.addEventListener("focus", () => {
      if (!el.files?.length) {
        el.remove();
      }
    });

    document.body.appendChild(el);
    el.click();
  });
};

const uploadImage = async () => {
  const files = await chooseFile({
    accepts: ["image/png", "image/jpeg", "image/webp"],
  });
  const reader = new FileReader();
  reader.readAsDataURL(files[0]);
  reader.onload = async () => {
    const baseData = reader.result as string;
    let byteString;
    if (baseData!.split(",")[0].indexOf("base64") >= 0) byteString = atob(baseData.split(",")[1]);
    else {
      byteString = unescape(baseData.split(",")[1]);
    }
    const mime_type = baseData.split(",")[0].split(":")[1].split(";")[0];
    const ia = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ia], { type: mime_type });
    const url = await uploadFile(blob, import.meta.env.VITE_SOLA_AUTH_TOKEN!);
    formState.image_url = url;
  };
};

const handleNext = async () => {
  if (!validateForm()) {
    toast.add({
      title: t("Invalid form", "Invalid form"),
      description: t("Please check the highlighted fields", "Please check the highlighted fields"),
      color: "error",
    });
    return;
  }
  step.value = 2;
};

const handleCreate = async () => {
  isSubmitting.value = true;
  const getProfileData = await $fetch<{
    success: boolean;
    message: string;
    data: { profile: Profile };
  }>("/api/profile", {
    method: "GET",
    query: {
      chain_id: useChain.chain.id,
      wallet_address: user.user!.evm_chain_address,
    },
  });

  if (!getProfileData.success) {
    toast.add({
      title: t("Get profile failed", "Get profile failed"),
      description: getProfileData.message ?? t("Get profile failed", "Get profile failed"),
      color: "error",
    });
    isSubmitting.value = false;
    return;
  }

  const profile = getProfileData.data?.profile;
  if (!profile) {
    // create profile
    try {
      const createProfileData = await $fetch<{
        success: boolean;
        message: string;
        data: { profile_id: string; tx_hash: string };
      }>("/api/profile/create", {
        method: "POST",
        body: {
          pin_code: pinCode.value.join(""),
          keystore_json: user.user!.encrypted_keys,
          chain_id: useChain.chain.id,
        },
      });

      if (!createProfileData.success) {
        toast.add({
          title: t("Create profile failed", "Create profile failed"),
          description:
            createProfileData.message ?? t("Create profile failed", "Create profile failed"),
          color: "error",
        });
        isSubmitting.value = false;
        return;
      } else {
        console.log("create profile tx hash", createProfileData.data.tx_hash);
        await chainContext(useChain.chain.id).publicClient.waitForTransactionReceipt({
          hash: createProfileData.data.tx_hash as `0x${string}`,
        });
      }
    } catch (error) {
      console.error(error);
      toast.add({
        title: t("Create profile failed", "Create profile failed"),
        description:
          error instanceof Error
            ? error.message
            : t("Create profile failed", "Create profile failed"),
        color: "error",
      });
      isSubmitting.value = false;
      return;
    }
  }

  try {
    const createClassData = await $fetch<{
      success: boolean;
      message: string;
      data: { class_id: string; profile_id: string; tx_hash: string };
    }>("/api/badge/create-class", {
      method: "POST",
      body: {
        pin_code: pinCode.value.join(""),
        keystore_json: user.user!.encrypted_keys,
        chain_id: useChain.chain.id,
        class_name: formState.name,
        class_description: formState.description,
        class_image_url: formState.image_url,
      },
    });

    if (!createClassData.success) {
      toast.add({
        title: t("Create failed", "Create failed"),
        description: createClassData.message ?? t("Create failed", "Create failed"),
        color: "error",
      });
      isSubmitting.value = false;
      return;
    } else {
      console.log("create class tx hash", createClassData.data.tx_hash);
      await chainContext(useChain.chain.id).publicClient.waitForTransactionReceipt({
        hash: createClassData.data.tx_hash as `0x${string}`,
      });
      toast.add({
        title: t("Create successful", "Create successful"),
        description: t("Create successful", "Create successful"),
        color: "success",
      });
      isSubmitting.value = false;
      router.replace("/badges");
    }
  } catch (error) {
    console.error(error);
    toast.add({
      title: t("Create failed", "Create failed"),
      description: error instanceof Error ? error.message : t("Create failed", "Create failed"),
      color: "error",
    });
    isSubmitting.value = false;
    return;
  }
};
</script>

<style scoped></style>
