<template>
  <div class="container mx-auto px-4 py-8 max-w-2xl">
    <div class="flex items-center gap-2 mb-6">
      <UButton variant="ghost" icon="i-heroicons-arrow-left" @click="navigateTo(`/safe/${safeId}`)" />
      <h1 class="text-2xl font-bold">发起交易</h1>
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
        title="Safe 尚未部署到链上"
        description="此 Safe 还没有链上合约地址，请先在设置中填写 Safe 地址，再发起交易。"
      />

      <UCard>
        <div class="space-y-4">
          <UFormGroup label="收款地址" required>
            <UInput v-model="form.to" placeholder="0x..." />
          </UFormGroup>

          <UFormGroup label="金额（ETH）">
            <UInput v-model="form.value_eth" type="number" step="0.0001" placeholder="0.0" />
          </UFormGroup>

          <UFormGroup label="调用数据（hex calldata）">
            <UInput v-model="form.data" placeholder="0x" />
          </UFormGroup>

          <UFormGroup label="备注">
            <UInput v-model="form.description" placeholder="说明这笔交易的用途" />
          </UFormGroup>

          <UFormGroup label="过期时间（小时）">
            <UInput v-model="form.expires_hours" type="number" placeholder="72" />
          </UFormGroup>

          <!-- 自动计算的交易哈希 -->
          <UFormGroup label="Safe 交易哈希（自动计算）">
            <div v-if="computedHash" class="font-mono text-xs bg-gray-50 p-2 rounded break-all text-gray-700">
              {{ computedHash }}
            </div>
            <div v-else class="text-sm text-gray-400 italic">
              填写 Safe 地址、收款地址和 Nonce 后自动计算
            </div>
          </UFormGroup>

          <UFormGroup label="Nonce">
            <UInput v-model.number="form.nonce" type="number" :placeholder="String(nextNonce)" />
          </UFormGroup>

          <UDivider label="立即签名（可选）" />

          <UFormGroup label="支付密码" description="输入钱包密码立即为此提案签名">
            <UInput v-model="passcode" type="password" placeholder="钱包支付密码" />
          </UFormGroup>
        </div>

        <template #footer>
          <div class="flex justify-between">
            <UButton variant="outline" @click="navigateTo(`/safe/${safeId}`)">取消</UButton>
            <UButton
              :loading="submitting"
              :disabled="!form.to || !computedHash || !safe?.safe_address"
              @click="submit"
            >
              {{ passcode ? '提交并签名' : '提交提案' }}
            </UButton>
          </div>
        </template>
      </UCard>
    </template>

    <UModal v-model="showError">
      <UCard>
        <template #header><h3 class="font-semibold text-red-600">错误</h3></template>
        <p>{{ errorMessage }}</p>
        <template #footer><UButton @click="showError = false">确定</UButton></template>
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

// Safe owner identity is the EOA signing key (Option A), not the smart account address.
function mySignerKey() {
  const user = userStore.user
  if (!user) return undefined
  return user.evm_chain_active_key
    ?? user.wallets?.find(w => w.id === user.active_wallet_id)?.evm_chain_active_key
    ?? user.wallets?.find(w => w.is_primary)?.evm_chain_active_key
    ?? user.wallets?.[0]?.evm_chain_active_key
    ?? undefined
}

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
            signer_address: mySignerKey(),
          },
        })
      } catch (signErr: any) {
        console.warn("自动签名失败：", signErr?.message)
      }
    }

    await navigateTo(`/safe/${safeId}/transactions/${txId}`)
  } catch (e: any) {
    errorMessage.value = e?.data?.error ?? e?.message ?? "创建交易失败"
    showError.value = true
  } finally {
    submitting.value = false
  }
}
</script>
