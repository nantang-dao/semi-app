<template>
  <div class="container mx-auto px-4 py-8 max-w-2xl">
    <div class="flex items-center gap-2 mb-6">
      <UButton variant="ghost" icon="i-heroicons-arrow-left" @click="navigateTo('/safe')" />
      <h1 class="text-2xl font-bold">Create Multi-Sig Wallet</h1>
    </div>

    <!-- Step indicator -->
    <div class="flex items-center gap-2 mb-8">
      <div
        v-for="(label, i) in steps"
        :key="i"
        class="flex items-center gap-2"
      >
        <div
          class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
          :class="step > i ? 'bg-primary text-white' : step === i ? 'bg-primary/20 text-primary border-2 border-primary' : 'bg-gray-200 text-gray-500'"
        >
          {{ i + 1 }}
        </div>
        <span class="text-sm" :class="step === i ? 'font-semibold' : 'text-gray-500'">{{ label }}</span>
        <UIcon v-if="i < steps.length - 1" name="i-heroicons-chevron-right" class="text-gray-400" />
      </div>
    </div>

    <!-- Step 1: Basic Info -->
    <UCard v-if="step === 0">
      <template #header><h2 class="font-semibold">Basic Info</h2></template>
      <div class="space-y-4">
        <UFormGroup label="Wallet Name" required>
          <UInput v-model="form.name" placeholder="e.g. Team Treasury" />
        </UFormGroup>
        <UFormGroup label="Network">
          <USelect v-model="form.chain_id" :options="chainOptions" />
        </UFormGroup>
        <UFormGroup label="Description">
          <UTextarea v-model="form.description" placeholder="Optional description" :rows="2" />
        </UFormGroup>
      </div>
      <template #footer>
        <UButton :disabled="!form.name" @click="step = 1">Next: Add Signers</UButton>
      </template>
    </UCard>

    <!-- Step 2: Add Signers -->
    <UCard v-else-if="step === 1">
      <template #header><h2 class="font-semibold">Add Signers</h2></template>
      <div class="space-y-3">
        <div
          v-for="(owner, i) in owners"
          :key="i"
          class="flex gap-2 items-start border rounded-lg p-3"
        >
          <div class="flex-1 space-y-2">
            <UInput v-model="owner.evm_address" placeholder="0x address" :disabled="i === 0" />
            <UInput v-model="owner.label" placeholder="Label (e.g. Alice)" />
          </div>
          <UButton
            v-if="i > 0"
            icon="i-heroicons-trash"
            color="error"
            variant="ghost"
            @click="removeOwner(i)"
          />
        </div>

        <!-- Search to add -->
        <div class="border rounded-lg p-3 space-y-2">
          <p class="text-sm font-medium text-gray-600">Add signer</p>
          <UInput
            v-model="searchQuery"
            placeholder="0x address or @handle"
            icon="i-heroicons-magnifying-glass"
          />
          <UButton size="sm" variant="outline" :disabled="!searchQuery" :loading="searchLoading" @click="addOwnerFromInput">
            Add
          </UButton>
        </div>
      </div>
      <template #footer>
        <div class="flex justify-between">
          <UButton variant="outline" @click="step = 0">Back</UButton>
          <UButton :disabled="owners.length < 1" @click="step = 2">Next: Set Threshold</UButton>
        </div>
      </template>
    </UCard>

    <!-- Step 3: Threshold -->
    <UCard v-else-if="step === 2">
      <template #header><h2 class="font-semibold">Set Approval Threshold</h2></template>
      <div class="space-y-6">
        <p class="text-gray-600">
          How many signers must approve a transaction before it can be executed?
        </p>
        <div class="flex items-center gap-4">
          <UButton icon="i-heroicons-minus" variant="outline" :disabled="form.threshold <= 1" @click="form.threshold--" />
          <div class="text-center">
            <div class="text-4xl font-bold text-primary">{{ form.threshold }}</div>
            <div class="text-sm text-gray-500">of {{ owners.length }} signers</div>
          </div>
          <UButton icon="i-heroicons-plus" variant="outline" :disabled="form.threshold >= owners.length" @click="form.threshold++" />
        </div>
        <p class="text-sm text-gray-500 bg-gray-50 rounded p-3">
          <strong>{{ form.threshold }}-of-{{ owners.length }}:</strong>
          Any {{ form.threshold }} of your {{ owners.length }} signer{{ owners.length > 1 ? 's' : '' }} must confirm a transaction.
        </p>
      </div>
      <template #footer>
        <div class="flex justify-between">
          <UButton variant="outline" @click="step = 1">Back</UButton>
          <UButton :loading="submitting" @click="submit">Create Safe</UButton>
        </div>
      </template>
    </UCard>

    <UModal v-model="showError">
      <UCard>
        <template #header><h3 class="font-semibold text-red-600">Error</h3></template>
        <p>{{ errorMessage }}</p>
        <template #footer>
          <UButton @click="showError = false">OK</UButton>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { getUserByHandleOrPhone } from "~/utils/semi_api"

const userStore = useUserStore()
const step = ref(0)
const steps = ["Basic Info", "Add Signers", "Set Threshold"]
const submitting = ref(false)
const showError = ref(false)
const errorMessage = ref("")
const searchQuery = ref("")
const searchLoading = ref(false)

const chainOptions = [
  { label: "Sepolia (testnet)", value: 11155111 },
  { label: "Ethereum Mainnet", value: 1 },
  { label: "Optimism", value: 10 },
]

const form = reactive({
  name: "",
  description: "",
  chain_id: 11155111,
  threshold: 1,
})

const owners = ref([
  {
    evm_address: userStore.user?.evm_chain_address ?? "",
    label: userStore.user?.handle ?? "Me",
    user_id: userStore.user?.id,
  },
])

function removeOwner(i: number) {
  owners.value.splice(i, 1)
  if (form.threshold > owners.value.length) form.threshold = owners.value.length
}

async function addOwnerFromInput() {
  const val = searchQuery.value.trim()
  if (!val) return

  if (val.startsWith("0x") && val.length === 42) {
    owners.value.push({ evm_address: val, label: "", user_id: undefined })
    searchQuery.value = ""
    return
  }

  // Try resolving as @handle or phone
  searchLoading.value = true
  try {
    const handle = val.startsWith("@") ? val.slice(1) : val
    const user = await getUserByHandleOrPhone(handle)
    if (user?.evm_chain_address) {
      owners.value.push({
        evm_address: user.evm_chain_address,
        label: user.handle ?? handle,
        user_id: user.id,
      })
      searchQuery.value = ""
    } else {
      errorMessage.value = `User @${handle} found but has no wallet address`
      showError.value = true
    }
  } catch {
    errorMessage.value = `Could not find user: ${val}`
    showError.value = true
  } finally {
    searchLoading.value = false
  }
}

async function submit() {
  submitting.value = true
  try {
    const res = await $fetch("/api/safe/wallets", {
      method: "POST",
      body: {
        name: form.name,
        description: form.description,
        chain_id: form.chain_id,
        threshold: form.threshold,
        owners: owners.value,
      },
    }) as any
    await navigateTo(`/safe/${res.wallet.id}`)
  } catch (e: any) {
    errorMessage.value = e?.data?.error ?? e?.message ?? "Failed to create Safe"
    showError.value = true
  } finally {
    submitting.value = false
  }
}
</script>
