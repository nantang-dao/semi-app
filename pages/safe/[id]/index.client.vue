<template>
  <div class="container mx-auto px-4 py-8">
    <div v-if="loading" class="flex justify-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="animate-spin text-4xl text-primary" />
    </div>

    <div v-else-if="error" class="text-red-500 py-4">Error: {{ error }}</div>

    <template v-else-if="safe">
      <div class="flex items-center gap-2 mb-6">
        <UButton variant="ghost" icon="i-heroicons-arrow-left" @click="navigateTo('/safe')" />
        <h1 class="text-2xl font-bold flex-1">{{ safe.name }}</h1>
        <UBadge :color="safe.status === 'active' ? 'success' : 'neutral'">{{ safe.status }}</UBadge>
        <UButton variant="ghost" icon="i-heroicons-cog-6-tooth" @click="navigateTo(`/safe/${safeId}/settings`)" />
      </div>

      <!-- Safe address -->
      <UCard class="mb-6">
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-sm text-gray-500">Safe Address</span>
            <span v-if="safe.safe_address" class="font-mono text-sm">{{ safe.safe_address }}</span>
            <UBadge v-else color="warning">Not deployed on-chain</UBadge>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm text-gray-500">Network</span>
            <span class="text-sm font-medium">{{ chainName(safe.chain_id) }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm text-gray-500">Threshold</span>
            <span class="text-sm font-medium">{{ safe.threshold }}-of-{{ safe.owners_count }}</span>
          </div>
        </div>
      </UCard>

      <!-- Owners -->
      <UCard class="mb-6">
        <template #header>
          <h2 class="font-semibold">Signers ({{ safe.owners?.length ?? safe.owners_count }})</h2>
        </template>
        <div class="space-y-2">
          <div
            v-for="owner in safe.owners"
            :key="owner.id"
            class="flex items-center gap-3 py-2"
          >
            <UIcon name="i-heroicons-user-circle" class="text-2xl text-gray-400" />
            <div class="flex-1">
              <p class="text-sm font-medium">{{ owner.label || owner.handle || shortAddress(owner.evm_address) }}</p>
              <p class="text-xs font-mono text-gray-400">{{ shortAddress(owner.evm_address) }}</p>
            </div>
            <UBadge v-if="owner.handle" color="info">@{{ owner.handle }}</UBadge>
          </div>
        </div>
      </UCard>

      <!-- Pending transactions -->
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-semibold">Transactions</h2>
        <UButton icon="i-heroicons-plus" size="sm" @click="navigateTo(`/safe/${safeId}/transactions/new`)">
          New Transaction
        </UButton>
      </div>

      <div v-if="txLoading" class="flex justify-center py-8">
        <UIcon name="i-heroicons-arrow-path" class="animate-spin text-3xl text-primary" />
      </div>

      <div v-else-if="transactions.length === 0" class="text-center py-8 text-gray-500">
        No transactions yet.
      </div>

      <div v-else class="space-y-3">
        <UCard
          v-for="tx in transactions"
          :key="tx.id"
          class="cursor-pointer hover:ring-2 hover:ring-primary"
          @click="navigateTo(`/safe/${safeId}/transactions/${tx.id}`)"
        >
          <div class="flex justify-between items-start">
            <div>
              <p class="font-medium">{{ tx.description || `Transfer to ${shortAddress(tx.to_address)}` }}</p>
              <p class="text-sm text-gray-500 mt-1">
                Nonce #{{ tx.nonce }} · {{ tx.signatures_collected }}/{{ tx.threshold }} signatures
              </p>
            </div>
            <UBadge :color="(statusColor(tx.status) as any)">{{ tx.status }}</UBadge>
          </div>
        </UCard>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const safeId = route.params.id as string

const { data: safeData, pending: loading, error } = await useFetch(`/api/safe/wallets/${safeId}`)
const safe = computed(() => (safeData.value as any)?.wallet)

const { data: txData, pending: txLoading } = await useFetch(`/api/safe/wallets/${safeId}/transactions`)
const transactions = computed(() => (txData.value as any)?.transactions ?? [])

function chainName(id: number) {
  const names: Record<number, string> = { 1: "Ethereum", 10: "Optimism", 11155111: "Sepolia" }
  return names[id] ?? `Chain ${id}`
}

function shortAddress(addr: string) {
  return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : ""
}

function statusColor(status: string) {
  const colors: Record<string, string> = { pending: "warning", ready: "info", executed: "success", rejected: "error", expired: "neutral" }
  return colors[status] ?? "neutral"
}
</script>
