<template>
  <div class="container mx-auto px-4 py-8">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-3xl font-bold">多签钱包</h1>
      <UButton icon="i-heroicons-plus" @click="navigateTo('/safe/create')">
        新建 Safe
      </UButton>
    </div>

    <div v-if="loading" class="flex justify-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="animate-spin text-4xl text-primary" />
    </div>

    <div v-else-if="error" class="text-red-500 py-4">加载失败：{{ error }}</div>

    <div v-else-if="wallets.length === 0" class="text-center py-12 text-gray-500">
      <UIcon name="i-heroicons-shield-check" class="text-6xl mb-4 block mx-auto" />
      <p class="text-lg font-medium">还没有多签钱包</p>
      <p class="text-sm mt-1">创建 Safe 以便多人共同管理资金。</p>
      <UButton class="mt-4" @click="navigateTo('/safe/create')">创建第一个 Safe</UButton>
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
              {{ wallet.threshold }}-of-{{ wallet.owners_count }} · {{ chainName(wallet.chain_id) }}
            </p>
            <p v-if="wallet.safe_address" class="text-xs font-mono text-gray-400 mt-1">
              {{ shortAddress(wallet.safe_address) }}
            </p>
            <p v-else class="text-xs text-yellow-600 mt-1">⚠ 尚未部署到链上</p>
          </div>
          <UBadge :color="wallet.status === 'active' ? 'success' : 'neutral'">
            {{ statusLabel(wallet.status) }}
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
  const names: Record<number, string> = { 1: "以太坊主网", 10: "Optimism", 11155111: "Sepolia 测试网" }
  return names[id] ?? `Chain ${id}`
}

function statusLabel(status: string) {
  return ({ active: "活跃", archived: "已归档", draft: "草稿" } as any)[status] ?? status
}

function shortAddress(addr: string) {
  return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : ""
}
</script>
