<template>
  <div class="container mx-auto px-4 py-8 max-w-2xl">
    <div class="flex items-center gap-2 mb-6">
      <UButton variant="ghost" icon="i-heroicons-arrow-left" @click="navigateTo(`/safe/${safeId}`)" />
      <h1 class="text-2xl font-bold">New Transaction</h1>
    </div>

    <div v-if="loadingSafe" class="flex justify-center py-8">
      <UIcon name="i-heroicons-arrow-path" class="animate-spin text-3xl text-primary" />
    </div>

    <template v-else>
      <UAlert
        v-if="!safe?.safe_address"
        icon="i-heroicons-exclamation-triangle"
        color="warning"
        class="mb-4"
        title="Safe not deployed on-chain"
        description="This Safe doesn't have an on-chain address yet. Set the Safe address first before proposing transactions."
      />

      <UCard>
        <div class="space-y-4">
          <UFormGroup label="To Address" required>
            <UInput v-model="form.to" placeholder="0x..." />
          </UFormGroup>

          <UFormGroup label="Value (ETH)">
            <UInput v-model="form.value_eth" type="number" step="0.0001" placeholder="0.0" />
          </UFormGroup>

          <UFormGroup label="Data (hex calldata)">
            <UInput v-model="form.data" placeholder="0x" />
          </UFormGroup>

          <UFormGroup label="Description">
            <UInput v-model="form.description" placeholder="What is this transaction for?" />
          </UFormGroup>

          <UFormGroup label="Expires in (hours)">
            <UInput v-model="form.expires_hours" type="number" placeholder="72" />
          </UFormGroup>

          <!-- Computed hash preview -->
          <UFormGroup label="Safe Tx Hash (auto-computed)">
            <div v-if="computedHash" class="font-mono text-xs bg-gray-50 p-2 rounded break-all text-gray-700">
              {{ computedHash }}
            </div>
            <div v-else class="text-sm text-gray-400 italic">
              Fill in Safe address, To, and Nonce to compute
            </div>
          </UFormGroup>

          <UFormGroup label="Nonce">
            <UInput v-model.number="form.nonce" type="number" :placeholder="String(nextNonce)" />
          </UFormGroup>

          <UDivider label="Sign immediately (optional)" />

          <UFormGroup label="Passcode" description="Enter your wallet passcode to sign this proposal now">
            <UInput v-model="passcode" type="password" placeholder="Wallet passcode" />
          </UFormGroup>
        </div>

        <template #footer>
          <div class="flex justify-between">
            <UButton variant="outline" @click="navigateTo(`/safe/${safeId}`)">Cancel</UButton>
            <UButton
              :loading="submitting"
              :disabled="!form.to || !computedHash || !safe?.safe_address"
              @click="submit"
            >
              {{ passcode ? 'Propose & Sign' : 'Create Proposal' }}
            </UButton>
          </div>
        </template>
      </UCard>
    </template>

    <UModal v-model="showError">
      <UCard>
        <template #header><h3 class="font-semibold text-red-600">Error</h3></template>
        <p>{{ errorMessage }}</p>
        <template #footer><UButton @click="showError = false">OK</UButton></template>
      </UCard>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { computeSafeTxHash, buildDefaultSafeTxParams, signSafeTxHash } from "~/utils/safe_multisig"
import { keystoreToPrivateKey } from "~/utils/encryption"
import type { Hex, Address } from "viem"

const route = useRoute()
const safeId = route.params.id as string
const userStore = useUserStore()
const submitting = ref(false)
const showError = ref(false)
const errorMessage = ref("")
const passcode = ref("")

const { data: safeData, pending: loadingSafe } = await useFetch(`/api/safe/wallets/${safeId}`)
const safe = computed(() => (safeData.value as any)?.wallet)

const { data: txListData } = await useFetch(`/api/safe/wallets/${safeId}/transactions`)
const nextNonce = computed(() => {
  const txs = (txListData.value as any)?.transactions ?? []
  if (txs.length === 0) return 0
  return Math.max(...txs.map((t: any) => t.nonce)) + 1
})

const form = reactive({
  to: "",
  value_eth: "0",
  data: "0x" as Hex,
  description: "",
  expires_hours: "72",
  nonce: null as number | null,
})

const effectiveNonce = computed(() => form.nonce ?? nextNonce.value)

const computedHash = computed(() => {
  if (!safe.value?.safe_address || !form.to) return null
  try {
    const params = buildDefaultSafeTxParams(
      form.to as Address,
      BigInt(Math.round(parseFloat(form.value_eth || "0") * 1e18)),
      (form.data || "0x") as Hex,
      effectiveNonce.value,
      safe.value.chain_id,
      safe.value.safe_address as Address
    )
    return computeSafeTxHash(params)
  } catch {
    return null
  }
})

async function submit() {
  if (!computedHash.value) return
  submitting.value = true
  try {
    const valueWei = BigInt(Math.round(parseFloat(form.value_eth || "0") * 1e18)).toString()

    const res = await $fetch(`/api/safe/wallets/${safeId}/transactions`, {
      method: "POST",
      body: {
        to: form.to,
        value: valueWei,
        data: form.data || "0x",
        description: form.description,
        expires_hours: form.expires_hours || 72,
        nonce: effectiveNonce.value,
        safe_tx_hash: computedHash.value,
      },
    }) as any

    const txId = res.transaction.id

    // If passcode provided, sign immediately
    if (passcode.value && userStore.user?.encrypted_keys) {
      try {
        const keystore = typeof userStore.user.encrypted_keys === "string"
          ? JSON.parse(userStore.user.encrypted_keys)
          : userStore.user.encrypted_keys
        const privateKey = await keystoreToPrivateKey(keystore, passcode.value) as Hex
        const signature = await signSafeTxHash(computedHash.value, privateKey)
        await $fetch(`/api/safe/wallets/${safeId}/transactions/${txId}/sign`, {
          method: "POST",
          body: {
            signature,
            signer_address: userStore.user.evm_chain_address,
          },
        })
      } catch (signErr: any) {
        // Proposal created, signing failed — navigate anyway, user can sign on detail page
        console.warn("Auto-sign failed:", signErr?.message)
      }
    }

    await navigateTo(`/safe/${safeId}/transactions/${txId}`)
  } catch (e: any) {
    errorMessage.value = e?.data?.error ?? e?.message ?? "Failed to create transaction"
    showError.value = true
  } finally {
    submitting.value = false
  }
}
</script>
