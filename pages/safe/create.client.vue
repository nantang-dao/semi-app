<template>
  <div class="container mx-auto px-4 py-8 max-w-2xl">
    <div class="flex items-center gap-2 mb-6">
      <UButton variant="ghost" icon="i-heroicons-arrow-left" @click="navigateTo('/safe')" />
      <h1 class="text-2xl font-bold">创建多签钱包</h1>
    </div>

    <!-- Step indicator -->
    <div class="flex items-center gap-2 mb-8">
      <div
        v-for="(label, i) in steps"
        :key="i"
        class="flex items-center gap-2"
      >
        <div
          class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
          :class="step > i ? 'bg-primary text-white' : step === i ? 'bg-primary/20 text-primary border-2 border-primary' : 'bg-gray-200 text-gray-500'"
        >
          {{ i + 1 }}
        </div>
        <span class="text-sm" :class="step === i ? 'font-semibold' : 'text-gray-500'">{{ label }}</span>
        <UIcon v-if="i < steps.length - 1" name="i-heroicons-chevron-right" class="text-gray-400" />
      </div>
    </div>

    <!-- Step 1: 基本信息 -->
    <UCard v-if="step === 0">
      <template #header><h2 class="font-semibold">基本信息</h2></template>
      <div class="w-full flex flex-col gap-4">
        <UFormField label="钱包名称" required>
          <UInput v-model="form.name" placeholder="例如：团队金库" class="w-full" />
        </UFormField>
        <UFormField label="网络">
          <USelect v-model="form.chain_id" :items="chainOptions" class="w-full" />
        </UFormField>
        <UFormField label="备注">
          <UTextarea v-model="form.description" placeholder="可选说明" :rows="2" class="w-full" />
        </UFormField>
      </div>
      <template #footer>
        <UButton :disabled="!form.name" @click="step = 1">下一步：添加签名人</UButton>
      </template>
    </UCard>

    <!-- Step 2: 添加签名人 -->
    <UCard v-else-if="step === 1">
      <template #header><h2 class="font-semibold">添加签名人</h2></template>
      <div class="space-y-3">
        <div
          v-for="(owner, i) in owners"
          :key="i"
          class="flex gap-2 items-start border rounded-lg p-3"
        >
          <div class="flex-1 flex flex-col gap-2">
            <UInput v-model="owner.evm_address" placeholder="0x 地址" :disabled="i === 0" class="w-full" />
            <UInput v-model="owner.label" placeholder="备注（如：Alice）" class="w-full" />
          </div>
          <UButton
            v-if="i > 0"
            icon="i-heroicons-trash"
            color="error"
            variant="ghost"
            @click="removeOwner(i)"
          />
        </div>

        <div class="border rounded-lg p-3 flex flex-col gap-2">
          <p class="text-sm font-medium text-gray-600">添加签名人</p>
          <div class="flex gap-2">
            <UInput
              v-model="searchQuery"
              placeholder="0x 地址 或 @用户名"
              icon="i-heroicons-magnifying-glass"
              class="flex-1"
            />
            <UButton variant="outline" :disabled="!searchQuery" :loading="searchLoading" @click="addOwnerFromInput">
              添加
            </UButton>
          </div>
        </div>
      </div>
      <template #footer>
        <div class="flex justify-between">
          <UButton variant="outline" @click="step = 0">上一步</UButton>
          <UButton :disabled="owners.length < 1" @click="step = 2">下一步：设置阈值</UButton>
        </div>
      </template>
    </UCard>

    <!-- Step 3: 阈值 -->
    <UCard v-else-if="step === 2">
      <template #header><h2 class="font-semibold">设置签名阈值</h2></template>
      <div class="space-y-6">
        <p class="text-gray-600">
          交易需要多少签名人确认才能执行？
        </p>
        <div class="flex items-center gap-4">
          <UButton icon="i-heroicons-minus" variant="outline" :disabled="form.threshold <= 1" @click="form.threshold--" />
          <div class="text-center">
            <div class="text-4xl font-bold text-primary">{{ form.threshold }}</div>
            <div class="text-sm text-gray-500">共 {{ owners.length }} 位签名人</div>
          </div>
          <UButton icon="i-heroicons-plus" variant="outline" :disabled="form.threshold >= owners.length" @click="form.threshold++" />
        </div>
        <p class="text-sm text-gray-500 bg-gray-50 rounded p-3">
          <strong>{{ form.threshold }}-of-{{ owners.length }}：</strong>
          任意 {{ form.threshold }} 位签名人确认后，交易即可执行。
        </p>

        <UFormField label="自定义 saltNonce（可选，高级）">
          <UInput v-model="customSalt" placeholder="留空则自动生成" class="w-full" />
          <template #help>
            saltNonce 决定 Safe 的链上地址。留空将自动生成并固定；指定相同的
            saltNonce 与签名人可在多条链上得到相同地址。
          </template>
        </UFormField>
      </div>
      <template #footer>
        <div class="flex justify-between">
          <UButton variant="outline" @click="step = 1">上一步</UButton>
          <UButton :loading="submitting" @click="submit">创建 Safe</UButton>
        </div>
      </template>
    </UCard>

    <UModal v-model:open="showError" title="错误">
      <template #body>
        <p>{{ errorMessage }}</p>
      </template>
      <template #footer>
        <UButton @click="showError = false">确定</UButton>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { getUserByHandleOrPhone, getUserByAddress, type UserInfo } from "~/utils/semi_api"
import { predictSafeAddress, randomSaltNonce } from "~/utils/safe_multisig"
import type { Address } from "viem"

const userStore = useUserStore()
const step = ref(0)
const steps = ["基本信息", "添加签名人", "设置阈值"]
const submitting = ref(false)
const showError = ref(false)
const errorMessage = ref("")
const searchQuery = ref("")
const searchLoading = ref(false)

const chainOptions = [
  { label: "Sepolia 测试网", value: 11155111 },
  { label: "以太坊主网", value: 1 },
  { label: "Optimism", value: 10 },
]

const form = reactive({
  name: "",
  description: "",
  chain_id: 11155111,
  threshold: 1,
})

// Optional override. Blank → a random 256-bit saltNonce is generated and fixed
// at creation, making the Safe address deterministic/reproducible thereafter.
const customSalt = ref("")

// Safe owners are the EOA signing keys (evm_chain_active_key), not the 4337
// smart account address — Safe verifies owner signatures via ecrecover (Option A).
function creatorSignerKey() {
  const user = userStore.user
  if (!user) return ""
  if (user.evm_chain_active_key) return user.evm_chain_active_key
  const primary = user.wallets?.find(w => w.id === user.active_wallet_id) ?? user.wallets?.find(w => w.is_primary) ?? user.wallets?.[0]
  return primary?.evm_chain_active_key ?? ""
}

const owners = ref([
  {
    evm_address: creatorSignerKey(),
    label: userStore.user?.handle ?? "我",
    user_id: userStore.user?.id,
  },
])

function removeOwner(i: number) {
  owners.value.splice(i, 1)
  if (form.threshold > owners.value.length) form.threshold = owners.value.length
}

async function addOwnerFromInput() {
  const val = searchQuery.value.trim()
  if (!val) return

  searchLoading.value = true
  try {
    let user: UserInfo | null = null
    let label = ""
    if (val.startsWith("0x") && val.length === 42) {
      user = await getUserByAddress(val)
      if (!user) {
        errorMessage.value = `地址 ${val.slice(0, 8)}... 不是 Semi 系统用户`
        showError.value = true
        return
      }
      label = user.handle ?? ""
    } else {
      const handle = val.startsWith("@") ? val.slice(1) : val
      user = await getUserByHandleOrPhone(handle)
      if (!user) {
        errorMessage.value = `找不到用户：${val}`
        showError.value = true
        return
      }
      label = user.handle ?? handle
    }

    // Owner = the user's EOA signing key (Option A), not their smart account address.
    const signerKey = user.evm_chain_active_key
    if (!signerKey) {
      errorMessage.value = `用户 ${user.handle ?? val} 尚未初始化钱包，无法作为签名人`
      showError.value = true
      return
    }
    if (owners.value.some(o => o.evm_address?.toLowerCase() === signerKey.toLowerCase())) {
      errorMessage.value = "该用户已是签名人"
      showError.value = true
      return
    }
    owners.value.push({
      evm_address: signerKey,
      label,
      user_id: user.id,
    })
    searchQuery.value = ""
  } catch {
    errorMessage.value = `查找失败：${val}`
    showError.value = true
  } finally {
    searchLoading.value = false
  }
}

async function submit() {
  submitting.value = true
  try {
    // Resolve the saltNonce (user override or fresh random), then deterministically
    // compute the Safe address before any on-chain deploy.
    let saltNonce: bigint
    if (customSalt.value.trim()) {
      try {
        saltNonce = BigInt(customSalt.value.trim())
      } catch {
        errorMessage.value = "saltNonce 必须是一个整数"
        showError.value = true
        return
      }
    } else {
      saltNonce = randomSaltNonce()
    }

    const ownerAddrs = owners.value.map(o => o.evm_address as Address)

    // Predict the deterministic Safe address up front. Non-blocking: if the
    // RPC call fails (e.g. no network) we still create the DB record; the
    // predicted_address will be null and can be computed later before deploy.
    let predicted: Address | null = null
    try {
      predicted = await predictSafeAddress(ownerAddrs, form.threshold, form.chain_id, saltNonce)
    } catch (predErr: any) {
      console.warn("[predictSafeAddress] failed, continuing without prediction:", predErr?.message)
    }

    const res = await $fetch("/api/safe/wallets", {
      method: "POST",
      body: {
        name: form.name,
        description: form.description,
        chain_id: form.chain_id,
        threshold: form.threshold,
        owners: owners.value,
        salt_nonce: saltNonce.toString(),
        predicted_address: predicted,
      },
    }) as any
    await navigateTo(`/safe/${res.wallet.id}`)
  } catch (e: any) {
    console.error("[create safe]", e)
    const raw = e?.data?.error ?? e?.message ?? "创建 Safe 失败"
    errorMessage.value = typeof raw === "string" ? raw : JSON.stringify(raw)
    showError.value = true
  } finally {
    submitting.value = false
  }
}
</script>
