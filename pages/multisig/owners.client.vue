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
      <h1 class="text-lg font-bold text-gray-800">{{ i18n.text['multisig.ownerManagement'] }}</h1>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="p-4 space-y-3">
      <div class="h-16 rounded-xl loading-bg" />
      <div class="h-48 rounded-xl loading-bg" />
    </div>

    <div v-else class="space-y-4 w-[80%] mx-auto">
      <!-- Header: threshold + count -->
      <div class="bg-white rounded-xl p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs text-gray-500 mb-1">{{ i18n.text['multisig.currentThreshold'] }}</p>
            <p class="text-2xl font-bold text-gray-800">
              {{ threshold }}<span class="text-gray-400 text-lg">/{{ owners.length }}</span>
            </p>
          </div>
          <div class="text-right">
            <p class="text-xs text-gray-500 mb-1">{{ i18n.text['multisig.ownerCount'] }}</p>
            <p class="text-2xl font-bold text-gray-800">{{ owners.length }}</p>
          </div>
        </div>
        <p class="text-xs text-gray-400 mt-2">{{ i18n.text['multisig.ownerManagementNote'] }}</p>
      </div>

      <!-- Owner list -->
      <div class="bg-white rounded-xl divide-y divide-gray-100">
        <div
          v-for="owner in owners"
          :key="owner.owner_address"
          class="flex items-center justify-between px-4 py-3"
        >
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm">👤</div>
            <div>
              <p class="text-sm font-medium text-gray-800">
                {{ owner.handle || owner.phone || '' }}
              </p>
              <CopyableAddress :address="owner.owner_address" text-class="text-xs text-gray-400" />
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span
              v-if="owner.owner_address.toLowerCase() === currentUserAddress"
              class="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full"
            >
              {{ i18n.text['multisig.you'] }}
            </span>
            <template v-else>
              <button
                class="text-xs text-orange-500 hover:text-orange-600 border border-orange-300 hover:border-orange-500 px-2 py-0.5 rounded-full transition-colors"
                @click="openReplaceSearch(owner)"
              >
                {{ i18n.text['multisig.replaceSigner'] || '替换' }}
              </button>
              <button
                class="text-xs text-red-400 hover:text-red-600 border border-red-200 hover:border-red-400 px-2 py-0.5 rounded-full transition-colors"
                @click="openRemoveModal(owner)"
              >
                {{ i18n.text['Remove'] }}
              </button>
            </template>
          </div>
        </div>
      </div>

      <!-- Action buttons -->
      <div class="space-y-3">
        <UButton block variant="soft" icon="i-ci-plus" @click="openAddSearch">
          {{ i18n.text['multisig.addSigner'] }}
        </UButton>
        <UButton block variant="soft" icon="i-ci-settings" @click="showChangeThreshold = true">
          {{ i18n.text['multisig.changeThreshold'] }}
        </UButton>
        <UButton block variant="soft" color="gray" icon="i-ci-refresh" :loading="syncing" @click="handleSync">
          {{ i18n.text['multisig.syncFromChain'] }}
        </UButton>
      </div>

      <p class="text-xs text-center text-gray-400">
        {{ i18n.text['multisig.ownerChangesAreProposals'] }}
      </p>
    </div>

    <!-- Add owner: search sheet -->
    <div
      v-if="showAddOwner"
      class="fixed inset-0 bg-black/40 z-40 flex items-center justify-center"
      @click.self="showAddOwner = false"
    >
      <div class="w-full max-w-sm mx-4 bg-white rounded-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto">
        <h3 class="text-base font-semibold">{{ i18n.text['multisig.addSigner'] }}</h3>
        <UInput
          v-model="addOwnerQuery"
          :placeholder="i18n.text['multisig.searchSignerPlaceholder']"
          size="lg"
          class="w-full"
          @keydown.enter="searchForNewOwner"
        />
        <div v-if="addOwnerResult" class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div>
            <p class="text-sm font-medium">{{ addOwnerResult.handle || addOwnerResult.name }}</p>
            <p v-if="addOwnerResult.renamed_from" class="text-xs text-amber-600">
              {{ (i18n.text['User renamed notice'] || '').replace('{handle}', addOwnerResult.handle || '') }}
            </p>
            <CopyableAddress :address="addOwnerResult.evm_chain_active_key" text-class="text-xs text-gray-400" />
          </div>
          <template v-if="isAlreadyOwner(addOwnerResult.evm_chain_active_key)">
            <span class="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{{ i18n.text['multisig.alreadySigner'] || '已是签名者' }}</span>
          </template>
          <template v-else>
            <UButton size="sm" @click="openAddModal">{{ i18n.text['multisig.next'] || 'Next' }}</UButton>
          </template>
        </div>
        <p v-if="addOwnerError" class="text-sm text-red-500">{{ addOwnerError }}</p>
        <UButton block :loading="searchingOwner" @click="searchForNewOwner">{{ i18n.text['multisig.search'] }}</UButton>
      </div>
    </div>

    <!-- Add / Remove owner: threshold modal -->
    <div
      v-if="showOwnerChangeModal"
      class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
      @click.self="closeOwnerChangeModal"
    >
      <div class="w-full max-w-sm mx-4 bg-white rounded-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto">
        <h3 class="text-base font-semibold text-gray-800">{{ ownerChangeModalTitle }}</h3>

        <div v-if="ownerChangeMode === 'remove' && removeTarget" class="p-3 bg-gray-50 rounded-lg text-sm">
          <p class="text-gray-500 mb-1">{{ i18n.text['multisig.removeTarget'] || 'Remove signer' }}</p>
          <p class="font-medium">{{ removeTarget.handle || removeTarget.phone || '' }}</p>
          <CopyableAddress :address="removeTarget.owner_address" text-class="text-xs text-gray-400 mt-1" />
        </div>

        <div v-if="ownerChangeMode === 'add' && addOwnerResult" class="p-3 bg-gray-50 rounded-lg text-sm">
          <p class="text-gray-500 mb-1">{{ i18n.text['multisig.addTarget'] || 'Add signer' }}</p>
          <p class="font-medium">{{ addOwnerResult.handle || addOwnerResult.name }}</p>
          <CopyableAddress :address="addOwnerResult.evm_chain_active_key" text-class="text-xs text-gray-400 mt-1" />
        </div>

        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-gray-500">{{ ownerChangeMode === 'add' ? (i18n.text['multisig.ownerCountAfterAdd'] || 'Owners after add') : (i18n.text['multisig.ownerCountAfterRemove'] || 'Owners after remove') }}</span>
            <span class="font-semibold">{{ ownerCountAfterChange }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">{{ i18n.text['multisig.currentThreshold'] }}</span>
            <span class="font-semibold">{{ threshold }}</span>
          </div>
        </div>

        <div class="space-y-2">
          <label class="text-sm font-medium text-gray-700">{{ i18n.text['multisig.newThreshold'] || 'New threshold' }}</label>
          <div class="flex items-center gap-4">
            <input
              type="range"
              :min="1"
              :max="ownerCountAfterChange"
              v-model.number="modalThreshold"
              class="flex-1 accent-primary-500"
            />
            <input
              type="number"
              :min="1"
              :max="ownerCountAfterChange"
              v-model.number="modalThresholdInput"
              class="w-14 text-center text-sm font-semibold text-gray-800 border border-gray-200 rounded-lg py-1 px-2 focus:outline-none focus:border-primary-500"
              @input="onModalThresholdInputChange"
            />
          </div>
          <p class="text-xs text-gray-400">
            {{ (i18n.text['multisig.thresholdRangeHint'] || 'Selectable: 1–{max}').replace('{max}', String(ownerCountAfterChange)) }}
          </p>
        </div>

        <div class="flex gap-3 pt-2">
          <UButton block variant="outline" color="gray" @click="closeOwnerChangeModal">
            {{ i18n.text['Cancel'] }}
          </UButton>
          <UButton block :loading="submittingOwnerChange" @click="submitOwnerChange">
            {{ ownerChangeSubmitLabel }}
          </UButton>
        </div>
      </div>
    </div>

    <!-- Change threshold only -->
    <div
      v-if="showChangeThreshold"
      class="fixed inset-0 bg-black/40 z-40 flex items-center justify-center"
      @click.self="showChangeThreshold = false"
    >
      <div class="w-full max-w-sm mx-4 bg-white rounded-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto">
        <h3 class="text-base font-semibold">{{ i18n.text['multisig.changeThreshold'] }}</h3>
        <div class="flex items-center gap-4">
          <input
            type="range"
            :min="1"
            :max="owners.length"
            v-model.number="newThreshold"
            class="flex-1 accent-primary-500"
          />
          <input
            type="number"
            :min="1"
            :max="owners.length"
            v-model.number="newThresholdInput"
            class="w-14 text-center text-sm font-semibold text-gray-800 border border-gray-200 rounded-lg py-1 px-2 focus:outline-none focus:border-primary-500"
            @input="onNewThresholdInputChange"
          />
        </div>
        <p class="text-sm font-semibold text-gray-800 text-right">
          {{ (i18n.text['multisig.requireNofM'] || '需要 {n}/{m} 人签名').replace('{n}', String(newThreshold)).replace('{m}', String(owners.length)) }}
        </p>
        <UButton block :loading="changingThreshold" @click="proposeChangeThreshold">
          {{ i18n.text['multisig.proposeChange'] }}
        </UButton>
      </div>
    </div>

    <!-- Replace owner: search sheet -->
    <div
      v-if="showReplaceOwner"
      class="fixed inset-0 bg-black/40 z-40 flex items-center justify-center"
      @click.self="showReplaceOwner = false"
    >
      <div class="w-full max-w-sm mx-4 bg-white rounded-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto">
        <h3 class="text-base font-semibold">{{ i18n.text['multisig.replaceSignerTitle'] || '替换签名者' }}</h3>

        <div class="p-3 bg-gray-50 rounded-lg text-sm">
          <p class="text-gray-500 mb-1">{{ i18n.text['multisig.replaceTarget'] || '将替换' }}</p>
          <p class="font-medium">{{ replaceTarget?.handle || replaceTarget?.phone || '' }}</p>
          <CopyableAddress v-if="replaceTarget?.owner_address" :address="replaceTarget.owner_address" text-class="text-xs text-gray-400 mt-1" />
        </div>

        <UInput
          v-model="replaceOwnerQuery"
          :placeholder="i18n.text['multisig.searchSignerPlaceholder']"
          @keydown.enter="searchForReplaceOwner"
        />
        <div v-if="replaceOwnerResult" class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div>
            <p class="text-sm font-medium">{{ replaceOwnerResult.handle || replaceOwnerResult.name }}</p>
            <p v-if="replaceOwnerResult.renamed_from" class="text-xs text-amber-600">
              {{ (i18n.text['User renamed notice'] || '').replace('{handle}', replaceOwnerResult.handle || '') }}
            </p>
            <CopyableAddress :address="replaceOwnerResult.evm_chain_active_key" text-class="text-xs text-gray-400" />
          </div>
          <template v-if="isAlreadyOwner(replaceOwnerResult.evm_chain_active_key)">
            <span class="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{{ i18n.text['multisig.alreadySigner'] || '已是签名者' }}</span>
          </template>
          <template v-else>
            <UButton size="sm" @click="openReplaceModal">{{ i18n.text['multisig.next'] || 'Next' }}</UButton>
          </template>
        </div>
        <p v-if="replaceOwnerError" class="text-sm text-red-500">{{ replaceOwnerError }}</p>
        <UButton block :loading="searchingReplaceOwner" @click="searchForReplaceOwner">{{ i18n.text['multisig.search'] }}</UButton>
      </div>
    </div>

    <!-- Replace owner: confirm modal -->
    <div
      v-if="showReplaceModal"
      class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
      @click.self="closeReplaceModal"
    >
      <div class="w-full max-w-sm mx-4 bg-white rounded-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto">
        <h3 class="text-base font-semibold text-gray-800">{{ i18n.text['multisig.replaceSignerTitle'] || '替换签名者' }}</h3>

        <div class="p-3 bg-gray-50 rounded-lg text-sm space-y-2">
          <div>
            <p class="text-gray-500 mb-1">{{ i18n.text['multisig.replaceTarget'] || '将替换' }}</p>
            <p class="font-medium">{{ replaceTarget?.handle || replaceTarget?.phone || '' }}</p>
            <CopyableAddress v-if="replaceTarget?.owner_address" :address="replaceTarget.owner_address" text-class="text-xs text-gray-400 mt-1" />
          </div>
          <div class="border-t border-gray-200 pt-2">
            <p class="text-gray-500 mb-1">{{ i18n.text['multisig.addTarget'] || 'Add signer' }}</p>
            <p class="font-medium">{{ replaceOwnerResult?.handle || replaceOwnerResult?.name }}</p>
            <CopyableAddress v-if="replaceOwnerResult?.evm_chain_active_key" :address="replaceOwnerResult.evm_chain_active_key" text-class="text-xs text-gray-400 mt-1" />
          </div>
        </div>

        <div class="flex gap-3 pt-2">
          <UButton block variant="outline" color="gray" @click="closeReplaceModal">
            {{ i18n.text['Cancel'] }}
          </UButton>
          <UButton block :loading="submittingReplace" @click="submitReplaceProposal">
            {{ i18n.text['multisig.submitReplaceProposal'] || '提交替换提案' }}
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useUserStore } from '~/stores/user'
import { useMultisigStore } from '~/stores/multisig'
import { useI18n } from '~/stores/i18n'
import {
  getMultisigWalletOwners,
  proposeMultisigTx,
  syncMultisigWallet,
  type MultisigOwner,
} from '~/utils/multisig_api'
import {
  encodeAddOwnerCall,
  encodeRemoveOwnerCall,
  encodeChangeThresholdCall,
  encodeSwapOwnerCall,
  getSafeOwners,
} from '~/utils/SafeSmartAccount/multisig'
import { getUserByHandle } from '~/utils/semi_api'
import { chainMap } from '~/stores/chain'

const router = useRouter()
const userStore = useUserStore()
const multisigStore = useMultisigStore()
const i18n = useI18n()
const toast = useToast()

const loading = ref(true)
const syncing = ref(false)
const owners = ref<MultisigOwner[]>([])
const threshold = ref(1)
const showAddOwner = ref(false)
const showChangeThreshold = ref(false)
const showOwnerChangeModal = ref(false)
const ownerChangeMode = ref<'add' | 'remove' | null>(null)
const removeTarget = ref<MultisigOwner | null>(null)
const modalThreshold = ref(1)
const modalThresholdInput = ref(1)
const submittingOwnerChange = ref(false)

const addOwnerQuery = ref('')
const addOwnerResult = ref<any>(null)
const addOwnerError = ref('')
const searchingOwner = ref(false)
const changingThreshold = ref(false)
const newThreshold = ref(1)
const newThresholdInput = ref(1)

const showReplaceOwner = ref(false)
const showReplaceModal = ref(false)
const replaceTarget = ref<MultisigOwner | null>(null)
const replaceOwnerQuery = ref('')
const replaceOwnerResult = ref<any>(null)
const replaceOwnerError = ref('')
const searchingReplaceOwner = ref(false)
const submittingReplace = ref(false)

const activeWallet = computed(() => multisigStore.activeWallet)
const currentUserAddress = computed(() => userStore.user?.evm_chain_active_key?.toLowerCase() || '')

const ownerCountAfterChange = computed(() => {
  if (ownerChangeMode.value === 'add') return owners.value.length + 1
  if (ownerChangeMode.value === 'remove') return Math.max(1, owners.value.length - 1)
  return owners.value.length
})

const ownerChangeModalTitle = computed(() => {
  if (ownerChangeMode.value === 'remove') {
    return i18n.text['multisig.removeSignerTitle'] || 'Remove signer'
  }
  return i18n.text['multisig.addSignerTitle'] || 'Add signer'
})

const ownerChangeSubmitLabel = computed(() => {
  if (ownerChangeMode.value === 'remove') {
    return i18n.text['multisig.submitRemoveProposal'] || 'Submit removal proposal'
  }
  return i18n.text['multisig.submitAddProposal'] || 'Submit add proposal'
})

watch(ownerCountAfterChange, (count) => {
  if (modalThreshold.value > count) modalThreshold.value = count
  if (modalThreshold.value < 1) modalThreshold.value = 1
})

watch(modalThreshold, (v) => {
  modalThresholdInput.value = v
})

function onModalThresholdInputChange() {
  let v = modalThresholdInput.value
  if (!v || isNaN(v)) return
  v = Math.max(1, Math.min(ownerCountAfterChange.value, Math.floor(v)))
  modalThresholdInput.value = v
  modalThreshold.value = v
}

watch(newThreshold, (v) => {
  newThresholdInput.value = v
})

function onNewThresholdInputChange() {
  let v = newThresholdInput.value
  if (!v || isNaN(v)) return
  v = Math.max(1, Math.min(owners.value.length, Math.floor(v)))
  newThresholdInput.value = v
  newThreshold.value = v
}

onMounted(async () => {
  if (!activeWallet.value) {
    router.push('/')
    return
  }
  await loadOwners()
})

function defaultThresholdAfterChange(count: number): number {
  return Math.min(threshold.value, count)
}

function openAddSearch() {
  addOwnerQuery.value = ''
  addOwnerResult.value = null
  addOwnerError.value = ''
  showAddOwner.value = true
}

function openAddModal() {
  if (!addOwnerResult.value) return
  ownerChangeMode.value = 'add'
  removeTarget.value = null
  modalThreshold.value = defaultThresholdAfterChange(owners.value.length + 1)
  modalThresholdInput.value = modalThreshold.value
  showAddOwner.value = false
  showOwnerChangeModal.value = true
}

function openRemoveModal(owner: MultisigOwner) {
  ownerChangeMode.value = 'remove'
  removeTarget.value = owner
  modalThreshold.value = defaultThresholdAfterChange(owners.value.length - 1)
  modalThresholdInput.value = modalThreshold.value
  showOwnerChangeModal.value = true
}

function closeOwnerChangeModal() {
  showOwnerChangeModal.value = false
  ownerChangeMode.value = null
  removeTarget.value = null
}

async function loadOwners() {
  loading.value = true
  try {
    const { owners: list, threshold: t } = await getMultisigWalletOwners(activeWallet.value!.id)
    owners.value = list
    threshold.value = t
    newThreshold.value = t
    newThresholdInput.value = t
  } catch (e: any) {
    toast.add({ title: i18n.text['Error'] || 'Error', description: e.message, color: 'error' })
  } finally {
    loading.value = false
  }
}

async function searchForNewOwner() {
  addOwnerError.value = ''
  addOwnerResult.value = null
  const q = addOwnerQuery.value.trim()
  if (!q) return
  searchingOwner.value = true
  try {
    const u = await getUserByHandle(q)
    const ownerAddress = u?.evm_chain_active_key || u?.evm_chain_address
    if (u?.id && ownerAddress) {
      addOwnerResult.value = { ...u, evm_chain_active_key: ownerAddress }
    } else if (u?.id) {
      addOwnerError.value = i18n.text['multisig.userNoWallet'] || '该用户尚未设置钱包地址'
    } else {
      addOwnerError.value = i18n.text['multisig.userNotFound'] || 'User not found'
    }
  } catch {
    addOwnerError.value = i18n.text['multisig.userNotFound'] || 'User not found'
  } finally {
    searchingOwner.value = false
  }
}

async function submitOwnerChange() {
  if (!activeWallet.value || !ownerChangeMode.value) return
  const newT = modalThreshold.value
  const maxT = ownerCountAfterChange.value
  if (newT < 1 || newT > maxT) {
    toast.add({
      title: i18n.text['Error'] || 'Error',
      description: (i18n.text['multisig.invalidThreshold'] || 'Threshold must be between 1 and {max}').replace('{max}', String(maxT)),
      color: 'error',
    })
    return
  }

  submittingOwnerChange.value = true
  try {
    if (ownerChangeMode.value === 'add') {
      await submitAddProposal(newT)
    } else if (ownerChangeMode.value === 'remove' && removeTarget.value) {
      await submitRemoveProposal(removeTarget.value, newT)
    }
    closeOwnerChangeModal()
  } catch (e: any) {
    toast.add({ title: i18n.text['Error'] || 'Error', description: e.message, color: 'error' })
  } finally {
    submittingOwnerChange.value = false
  }
}

async function submitAddProposal(newT: number) {
  if (!addOwnerResult.value || !activeWallet.value) return
  const newOwner = addOwnerResult.value.evm_chain_active_key as `0x${string}`
  const callData = encodeAddOwnerCall(newOwner, newT)

  const { tx } = await proposeMultisigTx({
    wallet_id: activeWallet.value.id,
    tx_type: 'add_owner',
    call_detail: { new_owner: newOwner, new_threshold: newT },
    evm_call_data: callData,
  })

  toast.add({ title: i18n.text['multisig.proposalCreated'] || 'Proposal created', color: 'success' })
  router.push(`/multisig/${tx.id}`)
}

async function submitRemoveProposal(owner: MultisigOwner, newT: number) {
  if (!activeWallet.value) return
  const chain = chainMap[activeWallet.value.chain_id]
  if (!chain) throw new Error('Unsupported chain')

  const { getPrevOwner } = await getSafeOwners(activeWallet.value.safe_address, chain)
  const prevOwner = getPrevOwner(owner.owner_address)
  const callData = encodeRemoveOwnerCall(prevOwner, owner.owner_address, newT)

  const { tx } = await proposeMultisigTx({
    wallet_id: activeWallet.value.id,
    tx_type: 'remove_owner',
    call_detail: { owner: owner.owner_address, prev_owner: prevOwner, new_threshold: newT },
    evm_call_data: callData,
  })

  toast.add({ title: i18n.text['multisig.proposalCreated'] || 'Proposal created', color: 'success' })
  router.push(`/multisig/${tx.id}`)
}

async function proposeChangeThreshold() {
  if (!activeWallet.value) return
  changingThreshold.value = true
  try {
    const callData = encodeChangeThresholdCall(newThreshold.value)

    const { tx } = await proposeMultisigTx({
      wallet_id: activeWallet.value.id,
      tx_type: 'change_threshold',
      call_detail: { new_threshold: newThreshold.value },
      evm_call_data: callData,
    })

    showChangeThreshold.value = false
    toast.add({ title: i18n.text['multisig.proposalCreated'] || 'Proposal created', color: 'success' })
    router.push(`/multisig/${tx.id}`)
  } catch (e: any) {
    toast.add({ title: i18n.text['Error'] || 'Error', description: e.message, color: 'error' })
  } finally {
    changingThreshold.value = false
  }
}

function openReplaceSearch(owner: MultisigOwner) {
  replaceTarget.value = owner
  replaceOwnerQuery.value = ''
  replaceOwnerResult.value = null
  replaceOwnerError.value = ''
  showReplaceOwner.value = true
}

async function searchForReplaceOwner() {
  replaceOwnerError.value = ''
  replaceOwnerResult.value = null
  const q = replaceOwnerQuery.value.trim()
  if (!q) return
  searchingReplaceOwner.value = true
  try {
    const u = await getUserByHandle(q)
    if (u?.evm_chain_active_key) {
      replaceOwnerResult.value = u
    } else {
      replaceOwnerError.value = i18n.text['multisig.userNotFound'] || 'User not found'
    }
  } catch {
    replaceOwnerError.value = i18n.text['multisig.userNotFound'] || 'User not found'
  } finally {
    searchingReplaceOwner.value = false
  }
}

function openReplaceModal() {
  if (!replaceOwnerResult.value || !replaceTarget.value) return
  showReplaceOwner.value = false
  showReplaceModal.value = true
}

function closeReplaceModal() {
  showReplaceModal.value = false
  replaceTarget.value = null
  replaceOwnerResult.value = null
}

async function submitReplaceProposal() {
  if (!activeWallet.value || !replaceTarget.value || !replaceOwnerResult.value) return

  submittingReplace.value = true
  try {
    const chain = chainMap[activeWallet.value.chain_id]
    if (!chain) throw new Error('Unsupported chain')

    const { getPrevOwner } = await getSafeOwners(activeWallet.value.safe_address, chain)
    const prevOwner = getPrevOwner(replaceTarget.value.owner_address)
    const newOwner = replaceOwnerResult.value.evm_chain_active_key as `0x${string}`

    const callData = encodeSwapOwnerCall(prevOwner, replaceTarget.value.owner_address, newOwner)

    const { tx } = await proposeMultisigTx({
      wallet_id: activeWallet.value.id,
      tx_type: 'replace_owner',
      call_detail: {
        old_owner: replaceTarget.value.owner_address,
        new_owner: newOwner,
        prev_owner: prevOwner,
      },
      evm_call_data: callData,
    })

    closeReplaceModal()
    toast.add({ title: i18n.text['multisig.proposalCreated'] || 'Proposal created', color: 'success' })
    router.push(`/multisig/${tx.id}`)
  } catch (e: any) {
    toast.add({ title: i18n.text['Error'] || 'Error', description: e.message, color: 'error' })
  } finally {
    submittingReplace.value = false
  }
}

async function handleSync() {
  if (!activeWallet.value) return
  syncing.value = true
  try {
    const chain = chainMap[activeWallet.value.chain_id]
    if (!chain) throw new Error('Unsupported chain')

    const { owners: chainOwners } = await getSafeOwners(activeWallet.value.safe_address, chain)
    const { createPublicClient, http } = await import('viem')
    const { RPC_URL } = await import('~/utils/config')
    const publicClient = createPublicClient({ chain, transport: http(RPC_URL[chain.id]) })
    const chainThreshold = await publicClient.readContract({
      address: activeWallet.value.safe_address,
      abi: [{ name: 'getThreshold', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }],
      functionName: 'getThreshold',
    }) as bigint

    await syncMultisigWallet({
      wallet_id: activeWallet.value.id,
      owners: chainOwners,
      threshold: Number(chainThreshold),
    })

    await multisigStore.fetchWallets()
    await loadOwners()
    toast.add({ title: i18n.text['multisig.syncSuccess'] || 'Synced from chain', color: 'success' })
  } catch (e: any) {
    toast.add({ title: i18n.text['Error'] || 'Error', description: e.message, color: 'error' })
  } finally {
    syncing.value = false
  }
}

function abbr(address: string): string {
  if (!address || address.length < 10) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function isAlreadyOwner(address: string): boolean {
  if (!address) return false
  const lower = address.toLowerCase()
  return owners.value.some((o) => o.owner_address.toLowerCase() === lower)
}
</script>
