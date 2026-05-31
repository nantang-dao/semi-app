<template>
  <div class="container mx-auto px-4 py-8 max-w-2xl">
    <div v-if="loading" class="flex justify-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="animate-spin text-4xl text-primary" />
    </div>

    <div v-else-if="error" class="text-red-500 py-4">加载失败：{{ error }}</div>

    <template v-else-if="tx">
      <div class="flex items-center gap-2 mb-6">
        <UButton variant="ghost" icon="i-heroicons-arrow-left" @click="navigateTo(`/safe/${safeId}`)" />
        <h1 class="text-2xl font-bold">交易 #{{ tx.nonce }}</h1>
        <UBadge :color="statusColor(tx.status)">{{ txStatusLabel(tx.status) }}</UBadge>
      </div>

      <!-- 交易详情 -->
      <UCard class="mb-4">
        <template #header><h2 class="font-semibold">交易详情</h2></template>
        <div class="space-y-2 text-sm">
          <div v-if="tx.description" class="py-1">
            <p class="text-gray-500">备注</p>
            <p class="font-medium">{{ tx.description }}</p>
          </div>
          <div class="flex justify-between py-1 border-t">
            <span class="text-gray-500">收款地址</span>
            <span class="font-mono">{{ tx.to_address }}</span>
          </div>
          <div class="flex justify-between py-1 border-t">
            <span class="text-gray-500">金额</span>
            <span class="font-medium">{{ formatEth(tx.value) }} ETH</span>
          </div>
          <div v-if="tx.data && tx.data !== '0x'" class="py-1 border-t">
            <p class="text-gray-500">调用数据</p>
            <p class="font-mono text-xs break-all bg-gray-50 p-2 rounded mt-1">{{ tx.data }}</p>
          </div>
          <div class="flex justify-between py-1 border-t">
            <span class="text-gray-500">Safe 交易哈希</span>
            <span class="font-mono text-xs">{{ shortHash(tx.safe_tx_hash) }}</span>
          </div>
          <div v-if="tx.expires_at" class="flex justify-between py-1 border-t">
            <span class="text-gray-500">过期时间</span>
            <span>{{ formatDate(tx.expires_at) }}</span>
          </div>
          <div v-if="tx.on_chain_tx_hash" class="flex justify-between py-1 border-t">
            <span class="text-gray-500">链上交易</span>
            <a :href="explorerUrl(tx.on_chain_tx_hash)" target="_blank" class="text-primary font-mono text-xs hover:underline">
              {{ shortHash(tx.on_chain_tx_hash) }}
            </a>
          </div>
        </div>
      </UCard>

      <!-- 签名进度 -->
      <UCard class="mb-4">
        <template #header>
          <div class="flex justify-between items-center">
            <h2 class="font-semibold">签名进度</h2>
            <span class="text-sm font-medium" :class="tx.signatures_collected >= tx.threshold ? 'text-green-600' : 'text-yellow-600'">
              {{ tx.signatures_collected }} / {{ tx.threshold }} 已确认
            </span>
          </div>
        </template>

        <UProgress :value="tx.signatures_collected" :max="tx.threshold" class="mb-3" />

        <div v-if="!tx.signatures?.length" class="text-sm text-gray-500 py-2">暂无签名。</div>
        <div v-else class="space-y-2">
          <div
            v-for="sig in tx.signatures"
            :key="sig.id"
            class="flex items-center gap-3 py-2 border-b last:border-0"
          >
            <UIcon name="i-heroicons-check-circle" class="text-green-500 text-xl shrink-0" />
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium">{{ sig.handle ? `@${sig.handle}` : shortAddress(sig.signer_address) }}</p>
              <p class="text-xs font-mono text-gray-400 truncate">{{ sig.signer_address }}</p>
            </div>
            <span class="text-xs text-gray-400 shrink-0">{{ formatDate(sig.signed_at) }}</span>
          </div>
        </div>
      </UCard>

      <!-- 签名操作 -->
      <UCard v-if="canSign" class="mb-4">
        <template #header><h2 class="font-semibold">确认此交易</h2></template>
        <p class="text-sm text-gray-600 mb-4">
          输入钱包支付密码以签名确认此交易。
        </p>
        <UFormGroup label="支付密码">
          <UInput
            v-model="passcode"
            type="password"
            placeholder="请输入钱包支付密码"
            @keydown.enter="submitSignature"
          />
        </UFormGroup>
        <template #footer>
          <UButton :loading="signing" :disabled="!passcode" @click="submitSignature">
            签名确认
          </UButton>
        </template>
      </UCard>

      <UAlert
        v-else-if="alreadySigned && (tx.status === 'pending' || tx.status === 'ready')"
        icon="i-heroicons-check-circle"
        color="success"
        title="你已签名确认此交易"
        :description="tx.status === 'ready' ? '已达到阈值，可以执行上链。' : '等待其他签名人确认。'"
        class="mb-4"
      />

      <UAlert
        v-if="tx.status === 'ready'"
        icon="i-heroicons-rocket-launch"
        color="info"
        title="已可执行"
        description="所有必要签名已收集完毕，可以将此交易提交上链。"
        class="mb-4"
      />

      <!-- 取消提案（仅提案人可操作） -->
      <UButton
        v-if="isProposer && tx.status === 'pending'"
        color="error"
        variant="outline"
        block
        :loading="cancelling"
        @click="cancelTx"
      >
        取消提案
      </UButton>

      <UNotifications />
    </template>
  </div>
</template>

<script setup lang="ts">
import { signSafeTxHash } from "~/utils/safe_multisig"
import { keystoreToPrivateKey } from "~/utils/encryption"
import type { Hex } from "viem"

const route = useRoute()
const safeId = route.params.id as string
const txId = route.params.tx_id as string
const userStore = useUserStore()
const toast = useToast()

const { data, pending: loading, error, refresh } = await useFetch(
  `/api/safe/wallets/${safeId}/transactions/${txId}`
)
const tx = computed(() => (data.value as any)?.transaction)

const signing = ref(false)
const cancelling = ref(false)
const passcode = ref("")

// Signer identity is the EOA signing key (Option A): the signature recovers to
// evm_chain_active_key, which is what the Safe lists as an owner.
const myAddress = computed(() => {
  const user = userStore.user
  if (!user) return undefined
  const key = user.evm_chain_active_key
    ?? user.wallets?.find(w => w.id === user.active_wallet_id)?.evm_chain_active_key
    ?? user.wallets?.find(w => w.is_primary)?.evm_chain_active_key
    ?? user.wallets?.[0]?.evm_chain_active_key
  return key?.toLowerCase()
})
const isProposer = computed(() => tx.value?.proposer_id === userStore.user?.id)
const alreadySigned = computed(() =>
  tx.value?.signatures?.some((s: any) => s.signer_address === myAddress.value)
)
const canSign = computed(() =>
  !alreadySigned.value &&
  !!myAddress.value &&
  (tx.value?.status === "pending" || tx.value?.status === "ready")
)

async function submitSignature() {
  if (!passcode.value || !userStore.user?.encrypted_keys) return
  signing.value = true
  try {
    const keystore = typeof userStore.user.encrypted_keys === "string"
      ? JSON.parse(userStore.user.encrypted_keys)
      : userStore.user.encrypted_keys
    const privateKey = await keystoreToPrivateKey(keystore, passcode.value) as Hex

    const signature = await signSafeTxHash(tx.value.safe_tx_hash as Hex, privateKey)

    await $fetch(`/api/safe/wallets/${safeId}/transactions/${txId}/sign`, {
      method: "POST",
      body: { signature, signer_address: myAddress.value },
    })

    passcode.value = ""
    toast.add({ title: "签名成功", color: "success" })
    await refresh()
  } catch (e: any) {
    toast.add({ title: "签名失败", description: e?.data?.error ?? e?.message, color: "error" })
  } finally {
    signing.value = false
  }
}

async function cancelTx() {
  cancelling.value = true
  try {
    await $fetch(`/api/safe/wallets/${safeId}/transactions/${txId}`, { method: "DELETE" })
    toast.add({ title: "提案已取消", color: "success" })
    await navigateTo(`/safe/${safeId}`)
  } catch (e: any) {
    toast.add({ title: "操作失败", description: e?.data?.error ?? e?.message, color: "error" })
  } finally {
    cancelling.value = false
  }
}

function txStatusLabel(status: string) {
  return ({ pending: "待签名", ready: "可执行", executed: "已执行", rejected: "已拒绝", expired: "已过期" } as any)[status] ?? status
}

function formatEth(wei: string) {
  if (!wei || wei === "0") return "0"
  try { return (Number(BigInt(wei)) / 1e18).toFixed(6).replace(/\.?0+$/, "") } catch { return "0" }
}
function shortAddress(addr: string) { return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "" }
function shortHash(hash: string) { return hash ? `${hash.slice(0, 10)}...${hash.slice(-8)}` : "" }
function formatDate(d: string) { return d ? new Date(d).toLocaleString("zh-CN") : "" }
function statusColor(status: string) {
  return ({ pending: "warning", ready: "info", executed: "success", rejected: "error", expired: "neutral" } as any)[status] ?? "neutral"
}
function explorerUrl(hash: string) { return `https://sepolia.etherscan.io/tx/${hash}` }
</script>
