<template>
  <div class="container mx-auto px-4 py-8 max-w-2xl">
    <div class="flex items-center gap-2 mb-6">
      <UButton variant="ghost" icon="i-heroicons-arrow-left" @click="navigateTo(`/safe/${safeId}`)" />
      <h1 class="text-2xl font-bold">Safe 设置</h1>
    </div>

    <div v-if="loading" class="flex justify-center py-8">
      <UIcon name="i-heroicons-arrow-path" class="animate-spin text-3xl text-primary" />
    </div>

    <template v-else-if="safe">
      <!-- 链上 Safe 地址 -->
      <UCard class="mb-6">
        <template #header>
          <h2 class="font-semibold">链上 Safe 合约地址</h2>
        </template>
        <p class="text-sm text-gray-600 mb-4">
          将此 Safe 记录关联到已部署的 Gnosis Safe 合约地址。该地址用于计算交易哈希和验证签名。
        </p>
        <UFormGroup label="Safe 合约地址">
          <UInput v-model="safeAddress" placeholder="0x..." />
        </UFormGroup>
        <p v-if="safe.safe_address" class="text-xs text-gray-500 mt-2">
          当前地址：<span class="font-mono">{{ safe.safe_address }}</span>
        </p>
        <template #footer>
          <UButton
            :loading="savingAddress"
            :disabled="!safeAddress || safeAddress === safe.safe_address"
            @click="saveSafeAddress"
          >
            {{ safe.safe_address ? '更新地址' : '设置地址' }}
          </UButton>
        </template>
      </UCard>

      <!-- 签名人列表（只读） -->
      <UCard class="mb-6">
        <template #header>
          <div class="flex justify-between items-center">
            <h2 class="font-semibold">签名人</h2>
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
          添加或移除签名人需要通过多签交易在链上完成（Phase 2）。
        </p>
      </UCard>

      <!-- 危险区域 -->
      <UCard v-if="isCreator">
        <template #header><h2 class="font-semibold text-red-600">危险操作</h2></template>
        <p class="text-sm text-gray-600 mb-4">
          归档后此 Safe 将从列表中隐藏，链上资金不受影响。
        </p>
        <UButton color="error" variant="outline" :loading="archiving" @click="archive">
          归档此 Safe
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
    toast.add({ title: "Safe 地址已更新", color: "success" })
    await refresh()
  } catch (e: any) {
    toast.add({ title: "更新失败", description: e?.data?.error ?? e?.message, color: "error" })
  } finally {
    savingAddress.value = false
  }
}

async function archive() {
  archiving.value = true
  try {
    await $fetch(`/api/safe/wallets/${safeId}`, { method: "DELETE" })
    toast.add({ title: "Safe 已归档", color: "success" })
    await navigateTo("/safe")
  } catch (e: any) {
    toast.add({ title: "操作失败", description: e?.data?.error ?? e?.message, color: "error" })
  } finally {
    archiving.value = false
  }
}

function shortAddress(addr: string) { return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "" }
</script>
