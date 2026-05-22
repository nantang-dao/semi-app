<template>
  <div class="container mx-auto px-4 py-8 max-w-2xl">
    <div class="flex items-center gap-2 mb-6">
      <UButton variant="ghost" icon="i-heroicons-arrow-left" @click="navigateTo(`/safe/${safeId}`)" />
      <h1 class="text-2xl font-bold">Safe Settings</h1>
    </div>

    <div v-if="loading" class="flex justify-center py-8">
      <UIcon name="i-heroicons-arrow-path" class="animate-spin text-3xl text-primary" />
    </div>

    <template v-else-if="safe">
      <!-- Set / update on-chain Safe address -->
      <UCard class="mb-6">
        <template #header>
          <h2 class="font-semibold">On-chain Safe Address</h2>
        </template>
        <p class="text-sm text-gray-600 mb-4">
          Link this Safe record to an on-chain Gnosis Safe contract address.
          The Safe contract must already be deployed. The address is used to compute
          transaction hashes and verify signatures.
        </p>
        <UFormGroup label="Safe Contract Address">
          <UInput v-model="safeAddress" placeholder="0x..." />
        </UFormGroup>
        <p v-if="safe.safe_address" class="text-xs text-gray-500 mt-2">
          Current: <span class="font-mono">{{ safe.safe_address }}</span>
        </p>
        <template #footer>
          <UButton
            :loading="savingAddress"
            :disabled="!safeAddress || safeAddress === safe.safe_address"
            @click="saveSafeAddress"
          >
            {{ safe.safe_address ? 'Update Address' : 'Set Address' }}
          </UButton>
        </template>
      </UCard>

      <!-- Owners list (read-only for now, Phase 3: add/remove via on-chain tx) -->
      <UCard class="mb-6">
        <template #header>
          <div class="flex justify-between items-center">
            <h2 class="font-semibold">Signers</h2>
            <UBadge>{{ safe.threshold }}-of-{{ safe.owners?.length }}</UBadge>
          </div>
        </template>
        <div class="space-y-2">
          <div
            v-for="owner in safe.owners"
            :key="owner.id"
            class="flex items-center gap-3 py-2 border-b last:border-0"
          >
            <UIcon name="i-heroicons-user-circle" class="text-2xl text-gray-400 shrink-0" />
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium">{{ owner.label || owner.handle || shortAddress(owner.evm_address) }}</p>
              <p class="text-xs font-mono text-gray-400 truncate">{{ owner.evm_address }}</p>
            </div>
            <UBadge v-if="owner.handle" color="info" size="xs">@{{ owner.handle }}</UBadge>
          </div>
        </div>
        <p class="text-xs text-gray-400 mt-3">
          Adding or removing signers requires a multi-sig transaction (on-chain, Phase 2).
        </p>
      </UCard>

      <!-- Archive -->
      <UCard v-if="isCreator">
        <template #header><h2 class="font-semibold text-red-600">Danger Zone</h2></template>
        <p class="text-sm text-gray-600 mb-4">
          Archiving hides this Safe from your list. On-chain funds are unaffected.
        </p>
        <UButton color="error" variant="outline" :loading="archiving" @click="archive">
          Archive this Safe
        </UButton>
      </UCard>
    </template>

    <UNotifications />
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const safeId = route.params.id as string
const userStore = useUserStore()
const toast = useToast()

const { data, pending: loading, refresh } = await useFetch(`/api/safe/wallets/${safeId}`)
const safe = computed(() => (data.value as any)?.wallet)

const safeAddress = ref("")
const savingAddress = ref(false)
const archiving = ref(false)

const isCreator = computed(() => safe.value?.creator_id === userStore.user?.id)

watch(safe, (val) => { if (val?.safe_address) safeAddress.value = val.safe_address }, { immediate: true })

async function saveSafeAddress() {
  savingAddress.value = true
  try {
    await $fetch(`/api/safe/wallets/${safeId}/set_safe_address`, {
      method: "PATCH",
      body: { safe_address: safeAddress.value },
    })
    toast.add({ title: "Safe address updated", color: "success" })
    await refresh()
  } catch (e: any) {
    toast.add({ title: "Error", description: e?.data?.error ?? e?.message, color: "error" })
  } finally {
    savingAddress.value = false
  }
}

async function archive() {
  archiving.value = true
  try {
    await $fetch(`/api/safe/wallets/${safeId}`, { method: "DELETE" })
    toast.add({ title: "Safe archived", color: "success" })
    await navigateTo("/safe")
  } catch (e: any) {
    toast.add({ title: "Error", description: e?.data?.error ?? e?.message, color: "error" })
  } finally {
    archiving.value = false
  }
}

function shortAddress(addr: string) { return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "" }
</script>
