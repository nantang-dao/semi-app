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
      <h1 class="text-2xl font-bold">{{ i18n.text["Send Badges"] }}</h1>
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
                  class="w-26 h-26 rounded-full overflow-hidden bg-gray-500 my-4 flex items-center justify-center"
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

          <UFormField name="receiver_addresses" :label="i18n.text['Receiver Addresses']">
            <div class="flex flex-col gap-3">
              <div
                v-for="(receiver, index) in formState.receivers"
                :key="`receiver-${index}`"
                class="flex items-start gap-2"
              >
                <UInput
                  icon="ci:user"
                  v-if="receiver.input !== receiver.wallet"
                  variant="subtle"
                  :model-value="receiver.input"
                  readonly
                />
                <UInput
                  icon="uil:wallet"
                  variant="subtle"
                  size="md"
                  :model-value="receiver.wallet"
                  readonly
                  class="flex-1"
                />
                <UButton
                  color="neutral"
                  variant="ghost"
                  icon="i-heroicons-trash"
                  :aria-label="i18n.text['Remove receiver']"
                  type="button"
                  size="xl"
                  @click="removeReceiver(index)"
                />
              </div>
              <div class="flex items-center gap-3">
                <UModal :title="i18n.text['Add Receiver']" v-model:open="showAddReceiverModal">
                  <UButton
                    color="primary"
                    variant="soft"
                    icon="i-heroicons-plus-circle"
                    type="button"
                    @click="showAddReceiverModal = true"
                  >
                    {{ i18n.text["Add Receiver"] }}
                  </UButton>
                  <template #body>
                    <div class="flex flex-col gap-3">
                      <div>{{ i18n.text["Please enter recipient address/phone number"] }}</div>
                      <UInput
                        variant="subtle"
                        size="lg"
                        v-model="newReceiverInput"
                        @keyup.enter="handleConfirmAddReceiver"
                      />
                      <span v-if="addReceiverError" class="text-sm text-error-500">{{
                        addReceiverError
                      }}</span>
                    </div>
                  </template>
                  <template #footer>
                    <div class="flex justify-center gap-3 w-full">
                      <UButton
                        color="neutral"
                        size="xl"
                        class="flex-1 justify-center"
                        @click="handleCancelAddReceiver"
                      >
                        {{ i18n.text["Cancel"] }}
                      </UButton>
                      <UButton
                        size="xl"
                        color="primary"
                        class="flex-1 justify-center"
                        @click="handleConfirmAddReceiver"
                        :loading="isValidatingReceiver"
                      >
                        {{ i18n.text["Confirm"] }}
                      </UButton>
                    </div>
                  </template>
                </UModal>
              </div>
              <span v-if="errors.receiver_addresses" class="text-sm text-error-500">{{
                errors.receiver_addresses
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
            {{ i18n.text["Send"] }}
          </UButton>
        </div>
      </div>

      <div
        v-if="step === 3"
        class="max-w-2xl mx-auto flex flex-col gap-4 justify-center items-center"
      >
        <UIcon name="ix:certificate-success" class="text-[90px] text-green-500" />
        <div class="text-2xl font-bold">
          {{ i18n.text["Send badges successful"] }}
        </div>
        <div>
          {{ i18n.text["After the user accepts, they will receive a badge."] }}
        </div>
        <div class="flex flex-row flex-wrap justify-center gap-4">
          <UButton
            type="submit"
            color="primary"
            size="lg"
            class="w-full min-w-[160px] justify-center"
            :disabled="isSubmitting"
            @click="router.push('/badges')"
          >
            {{ i18n.text["Back to My Badges"] }}
          </UButton>
          <UButton
            type="submit"
            color="neutral"
            size="lg"
            class="w-full min-w-[160px] justify-center"
            :disabled="isSubmitting"
            :loading="isSubmitting"
            @click="step = 1"
          >
            {{ i18n.text["Send More Badges"] }}
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BadgeClass } from "@/server/api/badge/types";
import { isAddress } from "viem";
import { getUserByHandleOrPhone, uploadFile } from "~/utils/semi_api";
import { isPhoneNumber } from "~/utils";

const route = useRoute();
const useChain = useChainStore();
const user = useUserStore();
const i18n = useI18n();
const router = useRouter();
const toast = useToast();

const chainId = Number(route.params.chain);
const classId = route.params.badge_class_address;
const receiverAddress = route.params.receiver_address;

const badgeClass = ref<BadgeClass | null>(null);

// 常量
const CODE_LENGTH = 6;
const DEFAULT_CODE = Array(CODE_LENGTH).fill("");

const step = ref(1);
const pinCode = ref(DEFAULT_CODE);

const translation = computed<Record<string, string>>(() => i18n.text as Record<string, string>);

const t = (key: string, fallback: string) => translation.value[key] ?? fallback;

interface Receiver {
  input: string;
  wallet: string;
}

interface FormState {
  image_url: string;
  name: string;
  description: string;
  receivers: Receiver[];
}

interface FormErrors {
  image_url: string;
  name: string;
  description: string;
  receiver_addresses: string;
}

const formState = reactive<FormState>({
  image_url: "",
  name: "",
  description: "",
  receivers: [],
});

const showAddReceiverModal = ref(false);
const newReceiverInput = ref("");
const addReceiverError = ref("");
const isValidatingReceiver = ref(false);

const errors = reactive<FormErrors>({
  image_url: "",
  name: "",
  description: "",
  receiver_addresses: "",
});

const isSubmitting = ref(false);

const fetchBadgeClass = async () => {
  const url = `/api/badge/classes/details?class_id=${classId}&chain_id=${chainId}`;
  const { data, error } = await useFetch<{ data: BadgeClass }>(url);
  if (error.value) {
    console.error(error.value);
  } else if (!!data.value) {
    badgeClass.value = data.value.data;
    formState.image_url = badgeClass.value.metadata.class_image_url;
    formState.name = badgeClass.value.metadata.class_name;
    formState.description = badgeClass.value.metadata.class_description;
  }
};

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

const handleCancelAddReceiver = () => {
  showAddReceiverModal.value = false;
  newReceiverInput.value = "";
  addReceiverError.value = "";
};

const handleConfirmAddReceiver = async () => {
  const input = newReceiverInput.value.trim();
  if (!input) {
    addReceiverError.value =
      i18n.text["Please enter recipient address/phone number"] ||
      "Please enter recipient address/phone number";
    return;
  }

  isValidatingReceiver.value = true;
  addReceiverError.value = "";

  try {
    // 检查是否是合法的以太坊地址
    if (isAddress(input)) {
      formState.receivers.push({
        input: input,
        wallet: input,
      });
      handleCancelAddReceiver();
      validateField("receiver_addresses");
    } else if (isPhoneNumber(input)) {
      // 检查是否是手机号
      const user = await getUserByHandleOrPhone(input);
      if (user?.evm_chain_address) {
        formState.receivers.push({
          input: input,
          wallet: user.evm_chain_address,
        });
        handleCancelAddReceiver();
        validateField("receiver_addresses");
      } else {
        addReceiverError.value = i18n.text["Invalid phone number"] || "Invalid phone number";
      }
    } else {
      addReceiverError.value = i18n.text["Invalid address"] || "Invalid address";
    }
  } catch (error) {
    console.error("Error validating receiver:", error);
    addReceiverError.value =
      i18n.text["Please check if the phone number is correct"] ||
      "Please check if the phone number is correct";
  } finally {
    isValidatingReceiver.value = false;
  }
};

const removeReceiver = (index: number) => {
  if (formState.receivers.length <= 0) {
    return;
  }
  formState.receivers.splice(index, 1);
  validateField("receiver_addresses");
};

const handleNext = () => {
  if (validateForm()) {
    step.value = 2;
  }
};

const handleCreate = async () => {
  isSubmitting.value = true;
  const { data, error } = await useFetch("/api/badge/create-badges", {
    method: "POST",
    body: {
      pin_code: pinCode.value.join(""),
      keystore_json: user.user!.encrypted_keys,
      chain_id: chainId,
      badge_name: formState.name,
      badge_description: formState.description,
      badge_image_url: formState.image_url,
      receiver_addresses: formState.receivers.map((r) => r.wallet),
      class_id: classId,
    },
  });
  isSubmitting.value = false;

  if (error.value) {
    toast.add({
      title: i18n.text["Send badges failed"],
      description: error.value?.data?.message ?? i18n.text["Send badges failed"],
      color: "error",
    });
  } else {
    if (!data.value?.success) {
      toast.add({
        title: i18n.text["Send badges failed"],
        description: data.value?.message ?? i18n.text["Send badges failed"],
        color: "error",
      });
    } else {
      toast.add({
        title: i18n.text["Send badges successful"],
        description: i18n.text["Send badges successful"],
        color: "success",
      });
      formState.receivers = [];
      step.value = 3;
    }
  }
};

const validateField = (field: keyof FormState | "receiver_addresses") => {
  if (field === "receiver_addresses") {
    const receivers = formState.receivers.filter((r) => r.wallet.trim());
    if (!receivers.length) {
      errors.receiver_addresses = t(
        "Please enter at least one receiver address",
        "Please enter at least one receiver address"
      );
      return;
    }
    const hasInvalidAddress = receivers.some((receiver) => !isAddress(receiver.wallet));
    errors.receiver_addresses = hasInvalidAddress ? t("Invalid address", "Invalid address") : "";
    return;
  }

  const value = formState[field];
  switch (field) {
    case "image_url":
      errors.image_url = (value as string).trim()
        ? ""
        : t("Please upload badge image", "Please upload badge image");
      break;
    case "name":
      errors.name = (value as string).trim()
        ? ""
        : t("Please enter badge name", "Please enter badge name");
      break;
    case "description":
      errors.description = (value as string).trim()
        ? ""
        : t("Please enter badge description", "Please enter badge description");
      break;
    default:
      break;
  }
};

const validateForm = () => {
  (Object.keys(formState) as Array<keyof FormState>).forEach((field) => {
    validateField(field);
  });
  validateField("receiver_addresses");

  return !Object.values(errors).some(Boolean);
};

watch(
  () => formState.receivers,
  () => {
    if (errors.receiver_addresses) {
      validateField("receiver_addresses");
    }
  },
  { deep: true }
);

// Initialization
onMounted(async () => {
  // Switch chain if necessary
  if (useChain.chain.id !== chainId) {
    await useChain.switch(chainId);
  }

  // Fetch badge class
  await fetchBadgeClass();

  // Pre-populate receiver
  if (receiverAddress) {
    const input = receiverAddress as string;
    if (isAddress(input)) {
      formState.receivers.push({
        input: input,
        wallet: input,
      });
    } else if (isPhoneNumber(input)) {
      const u = await getUserByHandleOrPhone(input);
      if (u?.evm_chain_address) {
        formState.receivers.push({
          input: input,
          wallet: u.evm_chain_address,
        });
      }
    }
  }
});
</script>

<style scoped></style>
