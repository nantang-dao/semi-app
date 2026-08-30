<template>
  <UModal :title="i18n.text['Badge Details']" :dismissible="false" v-model:open="showModal">
    <div
      @click="showModal = true"
      class="flex flex-col items-center justify-center bg-muted rounded-lg p-4 overflow-hidden gap-2 relative"
    >
      <UBadge color="warning" size="sm" v-if="isPending" class="absolute top-2 right-2"
        >{{ i18n.text["Pending"] }}
      </UBadge>
      <div class="flex items-center justify-center bg-gray-500 rounded-full overflow-hidden">
        <img :src="badge.metadata.badge_image_url" class="w-16 h-16 rounded-full" alt="" />
      </div>
      <div class="max-w-full text-xs font-bold whitespace-nowrap overflow-hidden text-ellipsis">
        {{ badge.metadata.badge_name }}
      </div>
    </div>

    <template #body>
      <div class="flex flex-col items-center justify-center gap-4">
        <div
          class="w-32 h-32 rounded-full overflow-hidden bg-gray-500 my-2 flex items-center justify-center"
        >
          <img
            :src="badge.metadata.badge_image_url"
            alt="badge image"
            class="object-cover w-full h-full"
          />
        </div>
        <div class="text-2xl font-bold">{{ badge.metadata.badge_name }}</div>
        <div class="text-sm text-gray-500">
          {{ badge.metadata.badge_description }}
        </div>
        <div class="flex flex-col gap-2 w-full overflow-x-auto bg-muted p-2 rounded-lg">
          <div class="flex flex-row items-start justify-between gap-2" v-if="badge.tx_hash">
            <div class="font-bold text-xs text-gray-500 whitespace-nowrap min-w-22">
              {{ i18n.text["Tx Hash"] }}
            </div>
            <div class="break-all text-xs text-right">
              {{ badge.tx_hash }}
              <div>
                <span
                  color="info"
                  variant="ghost"
                  size="xs"
                  class="py-0 p-1inline-flex items-center ml-2 flex-1 justify-center text-blue-500 text-xs cursor-pointer hover:underline"
                  @click="toExplorer(badge.tx_hash)"
                >
                  {{ i18n.text["Block Explorer"] }}
                </span>
                <span
                  color="info"
                  variant="ghost"
                  size="xs"
                  class="py-0 p-1inline-flex items-center ml-2 flex-1 justify-center text-blue-500 text-xs cursor-pointer hover:underline"
                  @click="handleCopy(badge.tx_hash)"
                >
                  {{ i18n.text["Copy"] }}
                </span>
              </div>
            </div>
          </div>
          <div class="flex flex-row items-start justify-between gap-2">
            <div class="font-bold text-xs text-gray-500 whitespace-nowrap min-w-22">
              {{ i18n.text["Published At"] }}
            </div>
            <div class="text-xs text-right">
              {{ formatDateTime(badge.created_at, true) }}
            </div>
          </div>
          <div class="flex flex-row items-start justify-between gap-2">
            <div class="font-bold text-xs text-gray-500 whitespace-nowrap min-w-22">
              {{ i18n.text["Owner"] }}
            </div>
            <div class="text-xs break-all text-right">
              {{ badge.wallet_address }}
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-center gap-4 w-full" v-if="isOwner && isPending">
        <UModal title="Input PIN Code" v-model:open="showRejectPINCode">
          <UButton
            color="neutral"
            size="xl"
            class="flex-1 justify-center"
            :disabled="acceptLoading || rejectLoading"
            :loading="rejectLoading"
            @click="showRejectPINCode = true"
          >
            {{ i18n.text["Reject"] }}
          </UButton>
          <template #body>
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
          </template>
          <template #footer>
            <div class="flex justify-center gap-4 w-full" v-if="isOwner">
              <UButton
                color="neutral"
                size="xl"
                class="flex-1 justify-center"
                :disabled="acceptLoading"
                @click="showRejectPINCode = false"
              >
                {{ i18n.text["Cancel"] }}</UButton
              >
              <UButton
                color="primary"
                size="xl"
                class="flex-1 justify-center"
                :loading="acceptLoading"
                :disabled="acceptLoading"
                @click="handleRejectBadge"
              >
                {{ i18n.text["Reject"] }}</UButton
              >
            </div>
          </template>
        </UModal>

        <UModal title="Input PIN Code" v-model:open="showAcceptPINCode">
          <UButton
            color="primary"
            size="xl"
            class="flex-1 justify-center"
            :disabled="acceptLoading || rejectLoading"
            :loading="acceptLoading"
            @click="showAcceptPINCode = true"
            >{{ i18n.text["Accept"] }}</UButton
          >
          <template #body>
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
          </template>
          <template #footer>
            <div class="flex justify-center gap-4 w-full" v-if="isOwner">
              <UButton
                color="neutral"
                size="xl"
                class="flex-1 justify-center"
                :disabled="acceptLoading"
                @click="showAcceptPINCode = false"
              >
                {{ i18n.text["Cancel"] }}</UButton
              >
              <UButton
                color="primary"
                size="xl"
                class="flex-1 justify-center"
                :loading="acceptLoading"
                :disabled="acceptLoading"
                @click="handleAcceptBadge"
              >
                {{ i18n.text["Accept"] }}</UButton
              >
            </div>
          </template>
        </UModal>
      </div>
      <div class="flex justify-center gap-4 w-full" v-else>
        <UButton color="neutral" size="xl" class="flex-1 justify-center" :disabled="true">
          {{ i18n.text["Accepted"] }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { Badge } from "@/server/api/badge/types";
import { formatDateTime } from "~/utils/format";
import { signBadgeAuth, isKeystoreError } from "@/utils/badge_auth_client";

const props = defineProps<{
  badge: Badge;
}>();

const emit = defineEmits<{
  (event: "update"): void;
}>();

const i18n = useI18n();

const user = useUserStore();
const toast = useToast();
const chainStore = useChainStore();
const showAcceptPINCode = ref(false);
const showRejectPINCode = ref(false);
const showModal = ref(false);
const acceptLoading = ref(false);
const rejectLoading = ref(false);
const useChain = useChainStore();

const CODE_LENGTH = 6;
const DEFAULT_CODE = Array(CODE_LENGTH).fill("");
const pinCode = ref(DEFAULT_CODE);

const isOwner = computed(() => {
  if (!user.user || !user.user.evm_chain_address) {
    return false;
  }

  return user.user.evm_chain_address === props.badge.wallet_address;
});

const isPending = computed(() => {
  return props.badge.status === "pending";
});

const handleAcceptBadge = async () => {
  // check pin code
  if (pinCode.value.join("") === "" || pinCode.value.join("").length !== CODE_LENGTH) {
    toast.add({
      title: "Please input PIN code",
      color: "error",
    });
    return;
  }

  showAcceptPINCode.value = false;
  acceptLoading.value = true;
  try {
    const response = await $fetch<{ success: boolean; message: string }>(
      "/api/badge/accept-badge",
      {
        method: "POST",
        body: {
          badge_id: props.badge.badge_id,
          ...(await signBadgeAuth({
            keystoreJson: user.user!.encrypted_keys,
            pinCode: pinCode.value.join(""),
            action: "accept-badge",
            chainId: chainStore.chain.id,
            params: { badge_id: props.badge.badge_id },
          })),
          chain_id: chainStore.chain.id,
        },
      }
    );

    if (response.success) {
      toast.add({
        title: response.message,
        color: "success",
      });
      emit("update");
      showModal.value = false;
    } else {
      toast.add({
        title: response.message,
        color: "error",
      });
    }
  } catch (error) {
    console.error(error);
    toast.add({
      // 解密失败说明 PIN 错——现在在客户端就能判断，不必发到服务端
      title: isKeystoreError(error) ? "Invalid passcode" : "Failed to accept badge",
      color: "error",
    });
  } finally {
    acceptLoading.value = false;
  }
};

const handleRejectBadge = async () => {
  // check pin code
  if (pinCode.value.join("") === "" || pinCode.value.join("").length !== CODE_LENGTH) {
    toast.add({
      title: "Please input PIN code",
      color: "error",
    });
    return;
  }

  showRejectPINCode.value = false;
  rejectLoading.value = true;
  try {
    const response = await $fetch<{ success: boolean; message: string }>(
      "/api/badge/reject-badge",
      {
        method: "POST",
        body: {
          badge_id: props.badge.badge_id,
          ...(await signBadgeAuth({
            keystoreJson: user.user!.encrypted_keys,
            pinCode: pinCode.value.join(""),
            action: "reject-badge",
            chainId: chainStore.chain.id,
            params: { badge_id: props.badge.badge_id },
          })),
          chain_id: chainStore.chain.id,
        },
      }
    );

    if (response.success) {
      toast.add({
        title: response.message,
        color: "success",
      });
      emit("update");
      showModal.value = false;
    } else {
      toast.add({
        title: response.message,
        color: "error",
      });
    }
  } catch (error) {
    console.error(error);
    toast.add({
      // 解密失败说明 PIN 错——现在在客户端就能判断，不必发到服务端
      title: isKeystoreError(error) ? "Invalid passcode" : "Failed to reject badge",
      color: "error",
    });
  } finally {
    rejectLoading.value = false;
  }
};

const toExplorer = (address: string) => {
  const url = useChain.chain.blockExplorers?.default?.url;
  window.open(`${url}/tx/${address}`, "_blank");
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
