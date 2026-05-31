<template>
  <div class="container mx-auto px-4 py-8">
    <div v-if="loading" class="flex justify-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="animate-spin text-4xl text-primary" />
    </div>

    <div v-else-if="error" class="text-red-500 py-4">加载失败：{{ error }}</div>

    <template v-else-if="safe">
      <div class="flex items-center gap-2 mb-6">
        <UButton variant="ghost" icon="i-heroicons-arrow-left" @click="navigateTo('/safe')" />
        <h1 class="text-2xl font-bold flex-1">{{ safe.name }}</h1>
        <UBadge :color="safe.status === 'active' ? 'success' : 'neutral'">{{ statusLabel(safe.status) }}</UBadge>
        <UButton variant="ghost" icon="i-heroicons-cog-6-tooth" @click="navigateTo(`/safe/${safeId}/settings`)" />
      </div>

      <!-- Safe 基本信息 -->
      <UCard class="mb-6">
        <div class="space-y-2">
          <div class="flex items-start justify-between">
            <span class="text-sm text-gray-500">Safe 地址</span>
            <span v-if="safe.safe_address" class="font-mono text-sm">{{ safe.safe_address }}</span>
            <div v-else class="flex flex-col items-end gap-1">
              <span v-if="safe.predicted_address" class="font-mono text-xs text-gray-400">
                {{ safe.predicted_address }}（预测地址）
              </span>
              <div class="flex items-center gap-2">
                <UBadge color="warning">尚未部署到链上</UBadge>
                <UButton size="xs" icon="i-heroicons-rocket-launch" :loading="deploying" @click="showDeployModal = true">
                  部署到链上
                </UButton>
              </div>
            </div>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm text-gray-500">网络</span>
            <span class="text-sm font-medium">{{ chainName(safe.chain_id) }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm text-gray-500">签名阈值</span>
            <span class="text-sm font-medium">{{ safe.threshold }}-of-{{ safe.owners_count }}</span>
          </div>
        </div>
      </UCard>

      <!-- 部署钱包 modal -->
      <UModal v-model:open="showDeployModal" title="部署 Safe 到链上">
        <template #body>
          <p class="text-sm text-gray-600 mb-4">
            输入支付密码，由你的钱包广播部署交易。需要 {{ chainName(safe.chain_id) }} 上的少量 ETH 作为 Gas。
          </p>
          <UFormField label="支付密码">
            <UInput v-model="deployPasscode" type="password" placeholder="钱包支付密码" class="w-full" @keydown.enter="deployOnChain" />
          </UFormField>
          <p v-if="deployError" class="text-red-500 text-sm mt-2">{{ deployError }}</p>
        </template>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="outline" @click="showDeployModal = false">取消</UButton>
            <UButton :loading="deploying" :disabled="!deployPasscode" @click="deployOnChain">
              确认部署
            </UButton>
          </div>
        </template>
      </UModal>

      <!-- 签名人列表 -->
      <UCard class="mb-6">
        <template #header>
          <h2 class="font-semibold">签名人（{{ safe.owners?.length ?? safe.owners_count }}）</h2>
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

      <!-- 交易列表 -->
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-semibold">交易</h2>
        <UButton icon="i-heroicons-plus" size="sm" @click="navigateTo(`/safe/${safeId}/transactions/new`)">
          发起交易
        </UButton>
      </div>

      <div v-if="txLoading" class="flex justify-center py-8">
        <UIcon name="i-heroicons-arrow-path" class="animate-spin text-3xl text-primary" />
      </div>

      <div v-else-if="transactions.length === 0" class="text-center py-8 text-gray-500">
        暂无交易记录
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
              <p class="font-medium">{{ tx.description || `转账至 ${shortAddress(tx.to_address)}` }}</p>
              <p class="text-sm text-gray-500 mt-1">
                Nonce #{{ tx.nonce }} · {{ tx.signatures_collected }}/{{ tx.threshold }} 已签名
              </p>
            </div>
            <UBadge :color="(statusColor(tx.status) as any)">{{ txStatusLabel(tx.status) }}</UBadge>
          </div>
        </UCard>
      </div>
    </template>
  </div>
  <UNotifications />
</template>

<script setup lang="ts">
import { deploySafeMultisig } from "~/utils/safe_multisig"
import { keystoreToPrivateKey } from "~/utils/encryption"
import type { Hex, Address } from "viem"

const route = useRoute()
const safeId = route.params.id as string
const userStore = useUserStore()
const toast = useToast()

const { data: safeData, pending: loading, error, refresh } = await useFetch(`/api/safe/wallets/${safeId}`)
const safe = computed(() => (safeData.value as any)?.wallet)

const { data: txData, pending: txLoading } = await useFetch(`/api/safe/wallets/${safeId}/transactions`)
const transactions = computed(() => (txData.value as any)?.transactions ?? [])

const showDeployModal = ref(false)
const deploying = ref(false)
const deployPasscode = ref("")
const deployError = ref("")

function resolveEncryptedKeys() {
  const user = userStore.user
  if (!user) return null
  if (user.encrypted_keys) return user.encrypted_keys
  const primary = user.wallets?.find(w => w.id === user.active_wallet_id)
    ?? user.wallets?.find(w => w.is_primary)
    ?? user.wallets?.[0]
  return primary?.encrypted_keys ?? null
}

async function deployOnChain() {
  deployError.value = ""

  if (!deployPasscode.value) {
    deployError.value = "请输入支付密码"
    return
  }

  const rawKeys = resolveEncryptedKeys()
  if (!rawKeys) {
    const msg = "找不到钱包密钥。请重新加载页面，或确认账户已正确初始化。"
    deployError.value = msg
    toast.add({ title: "缺少密钥", description: msg, color: "error" })
    return
  }

  deploying.value = true
  try {
    const keystore = typeof rawKeys === "string" ? JSON.parse(rawKeys) : rawKeys
    let privateKey: Hex
    try {
      privateKey = await keystoreToPrivateKey(keystore, deployPasscode.value) as Hex
    } catch (e: any) {
      const msg = "密码错误，无法解密钱包密钥"
      deployError.value = msg
      toast.add({ title: "密码错误", description: msg, color: "error" })
      return
    }

    const owners = (safe.value.owners as any[]).map((o: any) => o.evm_address as Address)

    if (!safe.value.salt_nonce) {
      const msg = "该 Safe 缺少 saltNonce，无法确定性部署，请重新创建钱包。"
      deployError.value = msg
      toast.add({ title: "无法部署", description: msg, color: "error" })
      return
    }
    const saltNonce = BigInt(safe.value.salt_nonce)

    toast.add({ title: "正在部署…", description: "交易已广播，等待链上确认", color: "info" })

    let safeAddress: Address
    try {
      safeAddress = await deploySafeMultisig(owners, safe.value.threshold, safe.value.chain_id, saltNonce, privateKey)
    } catch (e: any) {
      console.error("[deploySafeMultisig]", e)
      const msg = e?.shortMessage ?? e?.message ?? "链上部署失败"
      deployError.value = msg
      toast.add({ title: "部署失败", description: msg, color: "error" })
      return
    }

    // The deterministic deploy must land on the address we predicted at creation.
    const predicted = safe.value.predicted_address as string | undefined
    if (predicted && predicted.toLowerCase() !== safeAddress.toLowerCase()) {
      console.warn("[deploy] predicted vs deployed mismatch", predicted, safeAddress)
      toast.add({
        title: "地址与预测不一致",
        description: `预测 ${predicted}，实际 ${safeAddress}`,
        color: "warning",
      })
    }

    await $fetch(`/api/safe/wallets/${safeId}/set_safe_address`, {
      method: "PATCH",
      body: { safe_address: safeAddress },
    })

    showDeployModal.value = false
    deployPasscode.value = ""
    toast.add({ title: "Safe 部署成功", description: safeAddress, color: "success" })
    await refresh()
  } catch (e: any) {
    const msg = e?.data?.error ?? e?.message ?? "未知错误"
    console.error("[deployOnChain]", e)
    deployError.value = msg
    toast.add({ title: "部署失败", description: msg, color: "error" })
  } finally {
    deploying.value = false
  }
}

function chainName(id: number) {
  const names: Record<number, string> = { 1: "以太坊主网", 10: "Optimism", 11155111: "Sepolia 测试网" }
  return names[id] ?? `Chain ${id}`
}

function statusLabel(status: string) {
  return ({ active: "活跃", archived: "已归档", draft: "草稿" } as any)[status] ?? status
}

function txStatusLabel(status: string) {
  return ({ pending: "待签名", ready: "可执行", executed: "已执行", rejected: "已拒绝", expired: "已过期" } as any)[status] ?? status
}

function shortAddress(addr: string) {
  return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : ""
}

function statusColor(status: string) {
  const colors: Record<string, string> = { pending: "warning", ready: "info", executed: "success", rejected: "error", expired: "neutral" }
  return colors[status] ?? "neutral"
}
</script>
