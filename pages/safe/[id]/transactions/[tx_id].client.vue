<template>
  <div class="container mx-auto px-4 py-8 max-w-2xl">
    <div v-if="loading" class="flex justify-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="animate-spin text-4xl text-primary" />
    </div>

    <div v-else-if="error" class="text-red-500 py-4">Error: {{ error }}</div>

    <template v-else-if="tx">
      <div class="flex items-center gap-2 mb-6">
        <UButton variant="ghost" icon="i-heroicons-arrow-left" @click="navigateTo(`/safe/${safeId}`)" />
        <h1 class="text-2xl font-bold">Transaction #{{ tx.nonce }}</h1>
        <UBadge :color="statusColor(tx.status)">{{ tx.status }}</UBadge>
      </div>

      <!-- Details -->
      <UCard class="mb-4">
        <template #header><h2 class="font-semibold">Details</h2></template>
        <div class="space-y-2 text-sm">
          <div v-if="tx.description" class="py-1">
            <p class="text-gray-500">Description</p>
            <p class="font-medium">{{ tx.description }}</p>
          </div>
          <div class="flex justify-between py-1 border-t">
            <span class="text-gray-500">To</span>
            <span class="font-mono">{{ tx.to_address }}</span>
          </div>
          <div class="flex justify-between py-1 border-t">
            <span class="text-gray-500">Value</span>
            <span class="font-medium">{{ formatEth(tx.value) }} ETH</span>
          </div>
          <div v-if="tx.data && tx.data !== '0x'" class="py-1 border-t">
            <p class="text-gray-500">Data</p>
            <p class="font-mono text-xs break-all bg-gray-50 p-2 rounded mt-1">{{ tx.data }}</p>
          </div>
          <div class="flex justify-between py-1 border-t">
            <span class="text-gray-500">Safe Tx Hash</span>
            <span class="font-mono text-xs">{{ shortHash(tx.safe_tx_hash) }}</span>
          </div>
          <div v-if="tx.expires_at" class="flex justify-between py-1 border-t">
            <span class="text-gray-500">Expires</span>
            <span>{{ formatDate(tx.expires_at) }}</span>
          </div>
          <div v-if="tx.on_chain_tx_hash" class="flex justify-between py-1 border-t">
            <span class="text-gray-500">On-chain Tx</span>
            <a :href="explorerUrl(tx.on_chain_tx_hash)" target="_blank" class="text-primary font-mono text-xs hover:underline">
              {{ shortHash(tx.on_chain_tx_hash) }}
            </a>
          </div>
        </div>
      </UCard>

      <!-- Signatures progress -->
      <UCard class="mb-4">
        <template #header>
          <div class="flex justify-between items-center">
            <h2 class="font-semibold">Signatures</h2>
            <span class="text-sm font-medium" :class="tx.signatures_collected >= tx.threshold ? 'text-green-600' : 'text-yellow-600'">
              {{ tx.signatures_collected }} / {{ tx.threshold }} required
            </span>
          </div>
        </template>

        <!-- Progress bar -->
        <UProgress :value="tx.signatures_collected" :max="tx.threshold" class="mb-3" />

        <div v-if="!tx.signatures?.length" class="text-sm text-gray-500 py-2">No signatures yet.</div>
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

      <!-- Sign action -->
      <UCard v-if="canSign" class="mb-4">
        <template #header><h2 class="font-semibold">Approve This Transaction</h2></template>
        <p class="text-sm text-gray-600 mb-4">
          Enter your wallet passcode to sign and approve this transaction.
        </p>
        <UFormGroup label="Passcode">
          <UInput
            v-model="passcode"
            type="password"
            placeholder="Enter your wallet passcode"
            @keydown.enter="submitSignature"
          />
        </UFormGroup>
        <template #footer>
          <UButton :loading="signing" :disabled="!passcode" @click="submitSignature">
            Sign & Approve
          </UButton>
        </template>
      </UCard>

      <UAlert
        v-else-if="alreadySigned && (tx.status === 'pending' || tx.status === 'ready')"
        icon="i-heroicons-check-circle"
        color="success"
        title="You have signed this transaction"
        :description="tx.status === 'ready' ? 'Threshold reached — ready to execute on-chain.' : 'Waiting for more signatures.'"
        class="mb-4"
      />

      <UAlert
        v-if="tx.status === 'ready'"
        icon="i-heroicons-rocket-launch"
        color="info"
        title="Ready to execute"
        description="All required signatures collected. This transaction can now be submitted on-chain."
        class="mb-4"
      />

      <!-- Cancel (proposer only) -->
      <UButton
        v-if="isProposer && tx.status === 'pending'"
        color="error"
        variant="outline"
        block
        :loading="cancelling"
        @click="cancelTx"
      >
        Cancel Proposal
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

const myAddress = computed(() => userStore.user?.evm_chain_address?.toLowerCase())
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
    toast.add({ title: "Signed successfully", color: "success" })
    await refresh()
  } catch (e: any) {
    toast.add({ title: "Signing failed", description: e?.data?.error ?? e?.message, color: "error" })
  } finally {
    signing.value = false
  }
}

async function cancelTx() {
  cancelling.value = true
  try {
    await $fetch(`/api/safe/wallets/${safeId}/transactions/${txId}`, { method: "DELETE" })
    toast.add({ title: "Proposal cancelled", color: "success" })
    await navigateTo(`/safe/${safeId}`)
  } catch (e: any) {
    toast.add({ title: "Error", description: e?.data?.error ?? e?.message, color: "error" })
  } finally {
    cancelling.value = false
  }
}

function formatEth(wei: string) {
  if (!wei || wei === "0") return "0"
  try { return (Number(BigInt(wei)) / 1e18).toFixed(6).replace(/\.?0+$/, "") } catch { return "0" }
}
function shortAddress(addr: string) { return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "" }
function shortHash(hash: string) { return hash ? `${hash.slice(0, 10)}...${hash.slice(-8)}` : "" }
function formatDate(d: string) { return d ? new Date(d).toLocaleString() : "" }
function statusColor(status: string) {
  return ({ pending: "warning", ready: "info", executed: "success", rejected: "error", expired: "neutral" } as any)[status] ?? "neutral"
}
function explorerUrl(hash: string) { return `https://sepolia.etherscan.io/tx/${hash}` }
</script>
