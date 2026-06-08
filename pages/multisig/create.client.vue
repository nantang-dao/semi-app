<template>
  <div class="flex flex-col container-size rounded-xl bg-[var(--ui-bg)] shadow-lg p-4">
    <!-- Top bar -->
    <div class="flex items-center gap-3 mb-4">
      <UButton
        icon="i-heroicons-arrow-left"
        color="neutral"
        variant="ghost"
        class="self-start"
        @click="router.back()"
      >
        {{ i18n.text["Back"] }}
      </UButton>
      <h1 class="text-lg font-bold text-gray-800 flex-1">{{ i18n.text['multisig.createTeamWallet'] }}</h1>
      <NetworkSwitch />
    </div>

    <div class="space-y-5 w-[80%] mx-auto">
      <!-- Wallet name -->
      <div class="bg-white rounded-xl p-4 space-y-2">
        <label class="text-sm font-medium text-gray-700">{{ i18n.text['multisig.walletName'] }}</label>
        <UInput
          v-model="walletName"
          :placeholder="i18n.text['multisig.walletNamePlaceholder']"
          class="w-full"
        />
      </div>

      <!-- Owners -->
      <div class="bg-white rounded-xl p-4 space-y-3">
        <label class="text-sm font-medium text-gray-700">{{ i18n.text['multisig.signers'] }}</label>

        <!-- Fixed current user row -->
        <div class="flex items-center justify-between py-2 border-b border-gray-100">
          <div class="flex items-center gap-2">
            <span>👤</span>
            <div>
              <p class="text-sm font-medium text-gray-800">{{ currentUserDisplay }}</p>
              <CopyableAddress :address="currentUserAddress" text-class="text-xs text-gray-400" />
            </div>
          </div>
          <span class="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{{ i18n.text['multisig.you'] }}</span>
        </div>

        <!-- Added owners -->
        <div
          v-for="(owner, idx) in additionalOwners"
          :key="idx"
          class="flex items-center justify-between py-2"
        >
          <div class="flex items-center gap-2">
            <span>👤</span>
            <div>
              <p class="text-sm font-medium text-gray-800">{{ owner.name || owner.handle || '' }}</p>
              <CopyableAddress :address="owner.address" text-class="text-xs text-gray-400" />
            </div>
          </div>
          <button class="text-red-400 hover:text-red-600 text-sm" @click="removeOwner(idx)">✕</button>
        </div>

        <!-- Search bar -->
        <div class="flex gap-2 mt-1">
          <UInput
            v-model="searchQuery"
            :placeholder="i18n.text['multisig.searchSignerPlaceholder']"
            class="flex-1"
            @keydown.enter="searchUser"
          />
          <UButton icon="i-ci-search" variant="soft" @click="searchUser" :loading="searching" />
        </div>

        <!-- Search results -->
        <div v-if="searchResults.length" class="space-y-1">
          <button
            v-for="result in searchResults"
            :key="result.id"
            class="w-full flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors"
            :class="{ 'opacity-60 cursor-not-allowed hover:bg-transparent': isAlreadyAdded(result.evm_chain_active_key) }"
            :disabled="isAlreadyAdded(result.evm_chain_active_key)"
            @click="addOwner(result)"
          >
            <div class="flex items-center gap-2">
              <span>👤</span>
              <div class="text-left">
                <p class="text-sm font-medium">{{ result.handle || result.name }}</p>
                <CopyableAddress :address="result.evm_chain_active_key" text-class="text-xs text-gray-400" />
              </div>
            </div>
            <span v-if="isAlreadyAdded(result.evm_chain_active_key)" class="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{{ i18n.text['multisig.alreadySigner'] || '已是签名者' }}</span>
            <UIcon v-else name="ci:plus" size="16" class="text-primary-500" />
          </button>
        </div>

        <p v-if="searchError" class="text-sm text-red-500">{{ searchError }}</p>
      </div>

      <!-- Threshold -->
      <div class="bg-white rounded-xl p-4 space-y-3">
        <label class="text-sm font-medium text-gray-700">{{ i18n.text['multisig.signingThreshold'] }}</label>
        <div class="flex items-center gap-4">
          <input
            type="range"
            :min="1"
            :max="totalOwners"
            v-model.number="threshold"
            class="flex-1 accent-primary-500"
          />
          <input
            type="number"
            :min="1"
            :max="totalOwners"
            v-model.number="thresholdInput"
            class="w-14 text-center text-sm font-semibold text-gray-800 border border-gray-200 rounded-lg py-1 px-2 focus:outline-none focus:border-primary-500"
            @input="onThresholdInputChange"
          />
        </div>
        <p class="text-sm font-semibold text-gray-800 text-right">
          {{ (i18n.text['multisig.requireNofM'] || '需要 {n}/{m} 人签名').replace('{n}', String(threshold)).replace('{m}', String(totalOwners)) }}
        </p>

        <!-- Warning when threshold == total -->
        <div v-if="threshold === totalOwners" class="flex gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
          <span class="text-amber-500 text-base leading-tight">⚠️</span>
          <p class="text-xs text-amber-700 leading-relaxed">{{ i18n.text['multisig.allSignersRequiredWarning'] }}</p>
        </div>
      </div>

      <!-- Create button -->
      <UButton
        block
        size="lg"
        :loading="creating"
        :disabled="!canCreate"
        @click="handleCreate"
      >
        {{ i18n.text['multisig.createWallet'] }}
      </UButton>
    </div>

    <!-- Passcode modal -->
    <PasscodeModal
      v-if="showPasscode"
      @confirm="onPasscodeConfirm"
      @cancel="showPasscode = false"
    />
  </div>
</template>

<script setup lang="ts">
import { useUserStore } from '~/stores/user'
import { useMultisigStore } from '~/stores/multisig'
import { useI18n } from '~/stores/i18n'
import { predictSafeAccountAddress } from '~/utils/SafeSmartAccount/account'
import { useChainStore, chainMap } from '~/stores/chain'
import { createMultisigWallet } from '~/utils/multisig_api'
import { keystoreToPrivateKey } from '~/utils/encryption'
import { getUserByHandle } from '~/utils/semi_api'

const router = useRouter()
const userStore = useUserStore()
const multisigStore = useMultisigStore()
const chainStore = useChainStore()
const i18n = useI18n()
const toast = useToast()

// ─── State ────────────────────────────────────────────────────────────────────

const walletName = ref('')
const additionalOwners = ref<{ address: string; name?: string; handle?: string; user_id?: string }[]>([])
const threshold = ref(2)
const thresholdInput = ref(2)
const searchQuery = ref('')
const searchResults = ref<any[]>([])
const searching = ref(false)
const searchError = ref('')
const creating = ref(false)
const showPasscode = ref(false)
let passcodeResolve: ((key: string) => void) | null = null

const currentUserAddress = computed(() => userStore.user?.evm_chain_active_key || '')
const currentUserDisplay = computed(() => userStore.user?.handle || userStore.user?.name || abbr(currentUserAddress.value))
const totalOwners = computed(() => 1 + additionalOwners.value.length)
const canCreate = computed(() => walletName.value.trim() && totalOwners.value >= 2 && threshold.value >= 1)

// Auto-adjust threshold if owners change
watch(totalOwners, (n) => {
  const defaultThreshold = Math.ceil(n / 2)
  if (threshold.value > n) threshold.value = n
  if (threshold.value < 1) threshold.value = 1
  if (additionalOwners.value.length === 0) threshold.value = 1
  else if (threshold.value < defaultThreshold) threshold.value = defaultThreshold
})

watch(threshold, (v) => {
  thresholdInput.value = v
})

function onThresholdInputChange() {
  let v = thresholdInput.value
  if (!v || isNaN(v)) return
  v = Math.max(1, Math.min(totalOwners.value, Math.floor(v)))
  thresholdInput.value = v
  threshold.value = v
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function abbr(address: string): string {
  if (!address || address.length < 10) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function isAlreadyAdded(address: string): boolean {
  if (!address) return false
  const lower = address.toLowerCase()
  return (
    lower === currentUserAddress.value.toLowerCase() ||
    additionalOwners.value.some((o) => o.address.toLowerCase() === lower)
  )
}

function removeOwner(idx: number) {
  additionalOwners.value.splice(idx, 1)
}

function addOwner(result: any) {
  const addr = result.evm_chain_active_key
  if (!addr || isAlreadyAdded(addr)) return
  additionalOwners.value.push({
    address: addr,
    handle: result.handle,
    user_id: result.id,
  })
  searchQuery.value = ''
  searchResults.value = []
}

async function searchUser() {
  const q = searchQuery.value.trim()
  if (!q) return
  searching.value = true
  searchError.value = ''
  searchResults.value = []
  try {
    // Search by handle or address
    const u = await getUserByHandle(q)
    const ownerAddress = u?.evm_chain_active_key || u?.evm_chain_address
    if (u?.id && ownerAddress) {
      searchResults.value = [{ ...u, evm_chain_active_key: ownerAddress }]
    } else if (u?.id) {
      searchError.value = i18n.text['multisig.userNoWallet'] || '该用户尚未设置钱包地址'
    } else {
      searchError.value = i18n.text['multisig.userNotFound'] || 'User not found'
    }
  } catch {
    searchError.value = i18n.text['multisig.userNotFound'] || 'User not found'
  } finally {
    searching.value = false
  }
}

// ─── Create flow ─────────────────────────────────────────────────────────────

async function handleCreate() {
  if (!canCreate.value) return
  showPasscode.value = true
}

async function onPasscodeConfirm(passcode: string) {
  showPasscode.value = false
  creating.value = true
  try {
    // Get private key to sign for wallet creation
    const encryptedKeys = userStore.user?.encrypted_keys
    if (!encryptedKeys) throw new Error('No encrypted keys')
    const keystore = typeof encryptedKeys === 'string' ? JSON.parse(encryptedKeys) : encryptedKeys
    const privateKey = await keystoreToPrivateKey(keystore, passcode) as `0x${string}`

    // Build owner list (sorted)
    const allOwners = [
      currentUserAddress.value,
      ...additionalOwners.value.map((o) => o.address),
    ].map((a) => a.toLowerCase()).sort()

    // Get active chain
    const chainId = chainStore.chain.id
    const chain = chainMap[chainId]
    if (!chain) throw new Error('Unsupported chain')

    // Predict Safe address
    const safeAddress = await predictSafeAccountAddress({
      owners: allOwners as `0x${string}`[],
      threshold: threshold.value,
      chain,
    })

    // Create on backend
    const ownersPayload = allOwners.map((addr) => {
      const found = additionalOwners.value.find((o) => o.address.toLowerCase() === addr)
      const isCurrentUser = addr === currentUserAddress.value.toLowerCase()
      return {
        address: addr,
        user_id: isCurrentUser ? userStore.user?.id : found?.user_id,
      }
    })

    await createMultisigWallet({
      name: walletName.value.trim(),
      chain_id: chainId,
      owners: ownersPayload,
      threshold: threshold.value,
      safe_address: safeAddress,
    })

    // Refresh and navigate
    await multisigStore.fetchWallets()
    const newWallet = multisigStore.wallets.find((w) => w.safe_address.toLowerCase() === safeAddress.toLowerCase())
    if (newWallet) {
      multisigStore.setActiveWallet(newWallet.id)
    }

    toast.add({ title: i18n.text['multisig.walletCreated'] || 'Wallet created!', color: 'success' })
    router.push('/multisig/queue')
  } catch (err: any) {
    toast.add({ title: i18n.text['Error'] || 'Error', description: err.message, color: 'error' })
  } finally {
    creating.value = false
  }
}
</script>
