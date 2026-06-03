<template>
  <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
    <div class="absolute inset-0 bg-black/40" @click="handleCancel" />

    <div
      class="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-5 m-0 sm:m-4"
    >
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-base font-semibold text-gray-800">
          {{ titleText }}
        </h3>
        <button class="text-gray-400 hover:text-gray-600" @click="handleCancel">
          <UIcon name="ci:close-md" size="18" />
        </button>
      </div>

      <p v-if="subtitleText" class="text-sm text-gray-500 mb-4">
        {{ subtitleText }}
      </p>

      <UForm :state="formState" @submit="handleSubmit" class="w-full">
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

        <div class="flex gap-3 mt-5">
          <UButton
            type="button"
            color="neutral"
            variant="soft"
            class="flex-1 flex justify-center items-center"
            size="lg"
            :disabled="loading"
            @click="handleCancel"
          >
            {{ cancelText }}
          </UButton>
          <UButton
            type="submit"
            color="primary"
            class="flex-1 flex justify-center items-center"
            size="lg"
            :loading="loading"
            :disabled="loading || !isPinComplete"
          >
            {{ confirmText }}
          </UButton>
        </div>
      </UForm>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "~/stores/i18n";

const props = defineProps<{
  title?: string;
  subtitle?: string;
  confirmText?: string;
  cancelText?: string;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: "confirm", pin: string): void;
  (e: "cancel"): void;
}>();

const i18n = useI18n();

const formState = reactive({
  pin: Array(6).fill(""),
});

const loading = computed(() => !!props.loading);

const isPinComplete = computed(() => {
  return formState.pin.length === 6 && formState.pin.every((d) => d !== "");
});

const titleText = computed(() => props.title || i18n.text["Input PIN Code"] || "Input PIN Code");
const subtitleText = computed(() => props.subtitle || "");
const confirmText = computed(() => props.confirmText || i18n.text["Confirm"] || "Confirm");
const cancelText = computed(() => props.cancelText || i18n.text["Cancel"] || "Cancel");

function handleCancel() {
  emit("cancel");
}

function handleSubmit() {
  if (!isPinComplete.value) return;
  emit("confirm", formState.pin.join(""));
}
</script>

