<template>
  <div class="container mx-auto px-4 py-8">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-3xl font-bold">Multi-Sig Wallets</h1>
      <UButton icon="i-heroicons-plus" @click="navigateTo('/safe/create')">
        New Safe
      </UButton>
    </div>

    <div v-if="loading" class="flex justify-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="animate-spin text-4xl text-primary" />
    </div>

    <div v-else-if="error" class="text-red-500 py-4">Error: {{ error }}</div>

    <div v-else-if="wallets.length === 0" class="text-center py-12 text-gray-500">
      <UIcon name="i-heroicons-shield-check" class="text-6xl mb-4 block mx-auto" />
      <p class="text-lg font-medium">No multi-sig wallets yet</p>
      <p class="text-sm mt-1">Create a Safe to share control of funds with multiple signers.</p>
      <UButton class="mt-4" @click="navigateTo('/safe/create')">Create your first Safe</UButton>
    </div>

    <div v-else class="grid gap-4">
      <UCard
        v-for="wallet in wallets"
        :key="wallet.id"
        class="cursor-pointer hover:ring-2 hover:ring-primary"
        @click="navigateTo(`/safe/${wallet.id}`)"
      >
        <div class="flex justify-between items-start">
          <div>
            <h3 class="text-lg font-semibold">{{ wallet.name }}</h3>
            <p class="text-sm text-gray-500 mt-1">
              {{ wallet.threshold }}-of-{{ wallet.owners_count }} · Chain {{ chainName(wallet.chain_id) }}
            </p>
            <p v-if="wallet.safe_address" class="text-xs font-mono text-gray-400 mt-1">
              {{ shortAddress(wallet.safe_address) }}
            </p>
            <p v-else class="text-xs text-yellow-600 mt-1">⚠ Not deployed on-chain yet</p>
          </div>
          <UBadge :color="wallet.status === 'active' ? 'success' : 'neutral'">
            {{ wallet.status }}
          </UBadge>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
const { data, pending: loading, error } = await useFetch("/api/safe/wallets")
const wallets = computed(() => (data.value as any)?.wallets ?? [])

function chainName(id: number) {
  const names: Record<number, string> = { 1: "Ethereum", 10: "Optimism", 11155111: "Sepolia" }
  return names[id] ?? `Chain ${id}`
}

function shortAddress(addr: string) {
  return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : ""
}
</script>
