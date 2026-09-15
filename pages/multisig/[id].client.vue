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
      <h1 class="text-lg font-bold text-gray-800">{{ i18n.text['multisig.txDetail'] }}</h1>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="space-y-4 w-[80%] mx-auto flex-1 min-h-0 overflow-y-auto">
      <div class="h-20 rounded-xl loading-bg" />
      <div class="h-40 rounded-xl loading-bg" />
      <div class="h-32 rounded-xl loading-bg" />
    </div>

    <template v-else-if="tx">
      <!-- Status banner -->
      <div class="px-4 py-3 text-sm font-semibold text-center" :class="bannerClass">
        {{ i18n.text['multisig.status.' + tx.status] || tx.status }}
      </div>

      <div class="space-y-4 w-[80%] mx-auto pb-32 flex-1 min-h-0 overflow-y-auto">
        <!-- Transaction summary -->
        <div class="bg-white rounded-xl p-4 space-y-3">
          <h2 class="text-sm font-semibold text-gray-500 uppercase tracking-wide">{{ i18n.text['multisig.txSummary'] }}</h2>
          <div class="space-y-2">
            <div class="flex justify-between">
              <span class="text-sm text-gray-500">{{ i18n.text['multisig.type'] }}</span>
              <span class="text-sm font-medium">{{ txTypeLabel }}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-500">{{ i18n.text['multisig.proposer'] || '发起人' }}</span>
              <div class="flex items-center gap-1.5">
                <span class="text-sm font-medium">{{ proposerName }}</span>
                <CopyableAddress v-if="proposerAddress" :address="proposerAddress" text-class="text-xs text-gray-400" />
              </div>
            </div>
            <!-- 配置变更详情 -->
            <div v-if="configChangeDescription" class="bg-blue-50 rounded-lg px-3 py-2 text-sm text-blue-700">
              {{ configChangeDescription }}
            </div>
            <template v-if="tx.call_detail.amount">
              <div class="flex justify-between">
                <span class="text-sm text-gray-500">{{ i18n.text['multisig.amount'] }}</span>
                <span class="text-sm font-medium">{{ tx.call_detail.amount }}</span>
              </div>
            </template>
            <template v-if="tx.call_detail.to">
              <div class="flex justify-between items-center">
                <span class="text-sm text-gray-500">{{ i18n.text['To'] }}</span>
                <CopyableAddress :address="tx.call_detail.to" text-class="text-sm" />
              </div>
            </template>
            <template v-if="tx.user_op_snapshot">
              <div class="flex justify-between items-center">
                <span class="text-sm text-gray-500 flex items-center gap-1">
                  {{ displayGasLabel }}
                  <span
                    v-if="!(isExecuted && actualGasEth !== null)"
                    class="inline-flex items-center cursor-help"
                    :title="i18n.text['gas.estimatedTooltip'] || '实际费用以链上结算为准'"
                  >
                    <UIcon name="i-heroicons-question-mark-circle" size="14" class="text-gray-400" />
                  </span>
                </span>
                <span
                  class="text-sm font-medium"
                  :class="isExecuted && actualGasEth !== null ? 'text-green-600' : ''"
                >
                  {{ displayGasValue }} ETH
                </span>
              </div>
            </template>
            <div class="flex justify-between">
              <span class="text-sm text-gray-500">{{ i18n.text['multisig.nonce'] }}</span>
              <span class="text-sm font-mono text-gray-600">{{ tx.nonce || '—' }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-sm text-gray-500">{{ i18n.text['multisig.expires'] }}</span>
              <span class="text-sm text-gray-600">{{ tx.expires_at ? formatDate(tx.expires_at) : '—' }}</span>
            </div>
            <!-- Memo (public, on-chain) -->
            <template v-if="tx.memo">
              <div class="flex justify-between">
                <span class="text-sm text-gray-500">{{ i18n.text['Memo'] }}</span>
                <span class="text-sm text-gray-700 max-w-[60%] text-right break-all">{{ tx.memo }}</span>
              </div>
            </template>
            <!-- Sender Note (private, off-chain) -->
            <template v-if="tx.sender_note">
              <div class="flex justify-between">
                <span class="text-sm text-gray-500">{{ i18n.text['Sender Note'] }}</span>
                <span class="text-sm text-blue-600 max-w-[60%] text-right break-all">{{ tx.sender_note }}</span>
              </div>
            </template>
          </div>
        </div>

        <!-- Signature progress -->
        <div class="bg-white rounded-xl p-4 space-y-3">
          <h2 class="text-sm font-semibold text-gray-500 uppercase tracking-wide">{{ i18n.text['multisig.signers'] }}</h2>
          <SignatureProgress
            :owners="owners"
            :signatures="tx.signatures || []"
            :threshold="effectiveThreshold"
            :signed-count="isTerminal ? tx.signature_count : (tx.eligible_signature_count ?? tx.signature_count)"
            :proposal-threshold="isTerminal ? undefined : tx.threshold_at_creation"
            :owner-snapshot="isTerminal ? tx.owner_snapshot : null"
            :show-list="true"
          />
        </div>

        <!-- 同一项 owner 变更在各条链上的交易 -->
        <div v-if="groupTxs.length > 1" class="bg-white rounded-xl p-4 space-y-3">
          <h2 class="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            {{ i18n.text['multisig.allChains'] || '所有链' }}
          </h2>
          <p class="text-xs text-gray-400">
            {{ i18n.text['multisig.allChainsHint'] || '这项变更在每条链上各有一笔交易，需要分别签名和执行。未代付的链由数字身份自付 gas。' }}
          </p>
          <div class="divide-y divide-gray-100">
            <div v-for="g in groupTxs" :key="g.id" class="flex items-center justify-between py-2">
              <div class="flex items-center gap-2">
                <img v-if="chainMap[g.chain_id]" :src="chainMap[g.chain_id].icon" alt="" class="w-5 h-5" />
                <span class="text-sm" :class="g.id === tx.id ? 'font-semibold' : ''">{{ chainName(g.chain_id) }}</span>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-xs text-gray-500">{{ i18n.text['multisig.status.' + g.status] || g.status }}</span>
                <button
                  v-if="g.id !== tx.id && multisigStore.wallets.some((w) => w.id === g.wallet_id)"
                  class="text-xs text-primary-500 underline"
                  @click="router.push(`/multisig/${g.id}`)"
                >
                  {{ i18n.text['multisig.view'] || '查看' }}
                </button>
              </div>
            </div>
          </div>
          <div class="flex gap-2">
            <UButton
              v-if="groupHasSignable"
              class="flex-1"
              size="sm"
              variant="soft"
              :loading="groupAction === 'sign'"
              :disabled="groupBusy || signing || executing"
              @click="handleSignGroup"
            >
              {{ i18n.text['multisig.signAllChains'] || '为所有链签名' }}
            </UButton>
            <UButton
              v-if="groupHasReady"
              class="flex-1"
              size="sm"
              color="green"
              variant="soft"
              :loading="groupAction === 'execute'"
              :disabled="groupBusy || signing || executing"
              @click="handleExecuteGroup"
            >
              {{ i18n.text['multisig.executeAllChains'] || '执行所有就绪的链' }}
            </UButton>
          </div>
        </div>

        <!-- Withdraw (only proposer, only queued + unsigned) -->
        <div v-if="canWithdraw" class="text-center">
          <button class="text-sm text-gray-400 underline" @click="handleWithdraw">
            {{ i18n.text['multisig.withdrawTransaction'] }}
          </button>
        </div>

        <!-- Tx hash (executed) -->
        <div v-if="tx.status === 'executed' && tx.tx_hash" class="bg-white rounded-xl p-4 space-y-2">
          <p class="text-sm font-semibold text-gray-500">{{ i18n.text['Transaction Hash'] }}</p>
          <div class="flex items-center gap-2">
            <span class="text-xs font-mono text-gray-700 break-all">{{ tx.tx_hash }}</span>
            <button class="shrink-0 text-primary-500" @click="copyTxHash">
              <UIcon name="ci:copy" size="16" />
            </button>
          </div>
        </div>

        <!-- Failed reason -->
        <div v-if="tx.status === 'failed'" class="bg-red-50 rounded-xl p-4 space-y-2">
          <p class="text-sm font-medium text-red-600">{{ i18n.text['multisig.txFailed'] }}</p>
          <UButton block size="sm" color="red" variant="soft" @click="handleResubmit">
            {{ i18n.text['multisig.resubmit'] }}
          </UButton>
        </div>
      </div>

      <!-- Bottom action area (fixed) -->
      <div class="fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 px-4 py-4 space-y-3">
        <!-- Executing: show reset option if stuck -->
        <template v-if="tx.status === 'executing'">
          <p class="text-center text-sm text-gray-500">{{ i18n.text['multisig.executingHint'] || '交易正在执行中，请等待链上确认...' }}</p>
          <button
            v-if="canResetExecuting"
            class="w-full text-center text-sm text-red-500 underline"
            @click="handleResetExecuting"
          >
            {{ i18n.text['multisig.resetExecuting'] || '执行超时？点击重置为待执行状态' }}
          </button>
        </template>

        <!-- Not a current signer (e.g. removed owner): cannot sign -->
        <template v-if="!isTerminal && !isCurrentOwner">
          <p class="text-center text-sm text-amber-600">
            {{ i18n.text['multisig.notCurrentOwner'] || '你已不是该数字身份当前签名者，无法签名此交易' }}
          </p>
        </template>

        <!-- Sign -->
        <template v-else-if="!isTerminal && currentUserNotSigned">
          <UButton block size="lg" :loading="signing" :disabled="executing" @click="handleSign">
            {{ i18n.text['multisig.enterPasscodeToSign'] }}
          </UButton>
          <button
            v-if="canProposeReject"
            class="w-full text-center text-sm text-primary-500 underline disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="signing || executing"
            @click="handleProposeReject"
          >
            {{ rejectActionLabel }}
          </button>
        </template>

        <!-- Already signed, waiting -->
        <template v-else-if="!isTerminal && !currentUserNotSigned && tx.status !== 'ready'">
          <p class="text-center text-sm text-gray-500">✓ {{ i18n.text['multisig.youHaveSigned'] }}</p>
          <button
            v-if="canProposeReject"
            class="w-full text-center text-sm text-primary-500 underline disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="signing || executing"
            @click="handleProposeReject"
          >
            {{ rejectActionLabel }}
          </button>
        </template>

        <!-- Ready to execute -->
        <template v-else-if="tx.status === 'ready'">
          <UButton block size="lg" color="green" :loading="executing" :disabled="signing" @click="handleExecute">
            {{ i18n.text['multisig.executeTransaction'] }}
          </UButton>
          <button
            v-if="canProposeReject"
            class="w-full text-center text-sm text-primary-500 underline disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="signing || executing"
            @click="handleProposeReject"
          >
            {{ rejectActionLabel }}
          </button>
        </template>
      </div>
    </template>

    <!-- Error state -->
    <div v-else class="p-8 text-center text-gray-400">
      {{ i18n.text['multisig.txNotFound'] }}
    </div>

    <!-- Passcode modal -->
    <PasscodeModal
      v-if="showPasscode"
      :error-message="passcodeError"
      @confirm="onPasscodeConfirm"
      @cancel="showPasscode = false; passcodeError = ''"
    />
  </div>
</template>

<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '~/stores/user'
import { useMultisigStore } from '~/stores/multisig'
import { useI18n } from '~/stores/i18n'
import {
  getMultisigTx,
  getMultisigWalletOwners,
  submitMultisigSignature,
  executeMultisigTx,
  confirmMultisigTx,
  failMultisigTx,
  resetExecutingMultisigTx,
  withdrawMultisigTx,
  proposeMultisigTx,
  syncMultisigWallet,
  MultisigApiError,
  type MultisigTx,
  type MultisigOwner,
} from '~/utils/multisig_api'
import {
  signSafeOpSnapshot,
  buildMultisigUserOpSnapshot,
  executeMultisigUserOp,
  getActualGasFee,
  getSafeOwnersAndThreshold,
} from '~/utils/SafeSmartAccount/multisig'
import { keystoreToPrivateKey } from 'semi-core/keys'
import { chainMap } from '~/stores/chain'
import { uploadTransaction } from '~/utils/semi_api'
import { chainName } from '~/utils/multisig_chains'
import { getBalance } from '~/utils/balance'
import { parseEther, type Address, type Hex } from 'viem'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const multisigStore = useMultisigStore()
const i18n = useI18n()
const toast = useToast()

const txId = computed(() => route.params.id as string)
const loading = ref(true)
const tx = ref<MultisigTx | null>(null)
const owners = ref<MultisigOwner[]>([])
const signing = ref(false)
const executing = ref(false)
const showPasscode = ref(false)
const passcodeError = ref('')
const actualGasEth = ref<string | null>(null)
const loadingActualGas = ref(false)
let passcodeAction: 'sign' | 'execute' | 'signGroup' | 'executeGroup' = 'sign'
const groupBusy = computed(() => groupAction.value !== null)
const groupAction = ref<'sign' | 'execute' | null>(null)

/** 这笔交易所在链上的钱包行（同一 Safe 每条链一行，不一定是当前选中的那行） */
const walletRow = computed(() => multisigStore.wallets.find((w) => w.id === tx.value?.wallet_id) ?? null)

const CONFIG_TYPES = ['add_owner', 'remove_owner', 'change_threshold', 'replace_owner']
const ACTIVE_STATUSES = ['queued', 'signing', 'ready', 'executing', 'confirming']

/** 同组（同一项 owner 变更）各链的交易，只在 owner 变更上有 */
const groupTxs = computed(() => tx.value?.group_txs ?? [])
const groupHasSignable = computed(() => groupTxs.value.some((g) => ['queued', 'signing'].includes(g.status)))
const groupHasReady = computed(() => groupTxs.value.some((g) => g.status === 'ready'))

const currentUserAddress = computed(() => userStore.user?.evm_chain_active_key?.toLowerCase() || '')

// 门限：活跃交易用当前实时门限（与链上一致），终态交易用快照门限
const effectiveThreshold = computed(() => {
  if (!tx.value) return 0
  if (isTerminal.value) return tx.value.threshold_at_creation ?? 0
  return tx.value.current_threshold ?? tx.value.threshold_at_creation ?? 0
})

// 当前是否仍为有效 owner（owners 来自 getMultisigWalletOwners，即当前链上集合）
const isCurrentOwner = computed(() => {
  if (!currentUserAddress.value) return false
  if (tx.value?.current_owners?.length) {
    return tx.value.current_owners.some((a) => a.toLowerCase() === currentUserAddress.value)
  }
  return owners.value.some((o) => o.owner_address.toLowerCase() === currentUserAddress.value)
})

const currentUserNotSigned = computed(() => {
  if (!tx.value || !currentUserAddress.value) return false
  return !tx.value.signatures?.some(
    (s) => s.signer_address.toLowerCase() === currentUserAddress.value
  )
})

const isTerminal = computed(() =>
  ['executed', 'failed', 'withdrawn', 'superseded', 'expired'].includes(tx.value?.status || '')
)

const canWithdraw = computed(() =>
  tx.value?.status === 'queued' &&
  tx.value.signature_count === 0 &&
  tx.value.proposer_id === userStore.user?.id
)

const canProposeReject = computed(() => {
  if (!tx.value || tx.value.tx_type === 'cancel') return false
  return ['signing', 'ready'].includes(tx.value.status) && !!tx.value.nonce
})

const rejectActionLabel = computed(() => {
  if (tx.value?.pending_reject_tx_id) {
    return i18n.text['multisig.goSignPendingReject'] || 'Sign pending rejection'
  }
  return i18n.text['multisig.proposeReject'] || 'Propose rejection'
})

const bannerClass = computed(() => {
  const s = tx.value?.status
  if (s === 'signing' || s === 'queued') return 'bg-blue-50 text-blue-700'
  if (s === 'ready') return 'bg-green-50 text-green-700'
  if (s === 'executing') return 'bg-yellow-50 text-yellow-700'
  if (s === 'executed') return 'bg-green-50 text-green-800'
  if (s === 'failed') return 'bg-red-50 text-red-700'
  return 'bg-gray-100 text-gray-500'
})

const canResetExecuting = computed(() => {
  if (tx.value?.status !== 'executing') return false
  // 5 分钟后才允许重置
  const updatedAt = new Date(tx.value.updated_at).getTime()
  return Date.now() - updatedAt > 5 * 60 * 1000
})

const estimatedGasEth = computed(() => {
  const snap = tx.value?.user_op_snapshot
  if (!snap) return '~'
  const totalGas = BigInt(snap.verificationGasLimit) + BigInt(snap.callGasLimit) + BigInt(snap.preVerificationGas)
  const wei = totalGas * BigInt(snap.maxFeePerGas)
  return (Number(wei) / 1e18).toFixed(6)
})

const isExecuted = computed(() => tx.value?.status === 'executed')

const displayGasLabel = computed(() => {
  if (isExecuted.value && actualGasEth.value !== null) {
    return i18n.text['Actual Fee'] || '手续费（实际）'
  }
  return i18n.text['Estimated Fee'] || '手续费（预估）'
})

const displayGasValue = computed(() => {
  if (isExecuted.value && actualGasEth.value !== null) {
    return actualGasEth.value
  }
  return estimatedGasEth.value
})

// 发起人信息：终态交易从快照读取，活跃交易从实时数据读取
const proposerName = computed(() => {
  const snapshot = tx.value?.owner_snapshot
  // 终态交易：优先从快照读取
  if (snapshot && !Array.isArray(snapshot) && snapshot.proposer?.name) {
    return snapshot.proposer.name
  }
  // 活跃交易：从实时 proposer 字段读取
  return tx.value?.proposer?.name || ''
})

const proposerAddress = computed(() => {
  const snapshot = tx.value?.owner_snapshot
  if (snapshot && !Array.isArray(snapshot) && snapshot.proposer?.address) {
    return snapshot.proposer.address
  }
  return tx.value?.proposer?.address || ''
})

const txTypeLabel = computed(() => {
  const labels: Record<string, string> = {
    transfer: i18n.text['multisig.transferEth'] || 'ETH Transfer',
    erc20_transfer: i18n.text['multisig.transferToken'] || 'Token Transfer',
    add_owner: i18n.text['multisig.addOwner'] || 'Add Owner',
    remove_owner: i18n.text['multisig.removeOwner'] || 'Remove Owner',
    change_threshold: i18n.text['multisig.changeThreshold'] || 'Change Threshold',
    cancel: i18n.text['multisig.rejectTransaction'] || 'Reject Transaction',
    replace_owner: i18n.text['multisig.replaceOwner'] || 'Replace Signer',
  }
  return labels[tx.value?.tx_type || ''] || tx.value?.tx_type || ''
})

// 配置变更交易的具体描述
const configChangeDescription = computed(() => {
  if (!tx.value?.call_detail) return null
  const d = tx.value.call_detail
  const findName = (addr: string, nameField?: string) => {
    if (!addr) return ''
    // 0. 优先使用 call_detail 中后端补充的名字字段
    if (nameField && d[nameField]) return d[nameField]
    const lower = addr.toLowerCase()
    // 1. 从当前 owner 列表找
    const o = owners.value.find((o) => o.owner_address?.toLowerCase() === lower)
    if (o?.handle || o?.phone) return o.handle || o.phone
    // 2. 从该交易的 owner_snapshot 中找（覆盖已被移除的 owner）
    const snapshotOwners = tx.value.owner_snapshot
      ? (Array.isArray(tx.value.owner_snapshot) ? tx.value.owner_snapshot : tx.value.owner_snapshot.owners || [])
      : []
    const entry = snapshotOwners.find((e: any) => e.address?.toLowerCase() === lower)
    if (entry?.name) return entry.name
    return abbr(addr)
  }
  switch (tx.value.tx_type) {
    case 'add_owner':
      return `${i18n.text['multisig.addOwner'] || 'Add Owner'}: ${findName(d.new_owner, 'new_owner_name')} → ${i18n.text['multisig.threshold'] || 'Threshold'} ${d.new_threshold}`
    case 'remove_owner':
      return `${i18n.text['multisig.removeOwner'] || 'Remove Owner'}: ${findName(d.owner, 'owner_name')} → ${i18n.text['multisig.threshold'] || 'Threshold'} ${d.new_threshold}`
    case 'change_threshold':
      return `${i18n.text['multisig.threshold'] || 'Threshold'}: ${tx.value.threshold_at_creation} → ${d.new_threshold}`
    case 'replace_owner':
      return `${i18n.text['multisig.replaceOwner'] || 'Replace Signer'}: ${findName(d.old_owner, 'old_owner_name')} → ${findName(d.new_owner, 'new_owner_name')}`
    default:
      return null
  }
})

// ─── Load ─────────────────────────────────────────────────────────────────────

onMounted(async () => {
  // 直接打开详情页时钱包列表可能还没加载，签名/执行要按交易所在链找钱包行
  if (!multisigStore.wallets.length) await multisigStore.fetchWallets()
  await loadTx()
})

// 在「所有链」里点查看，是同一个页面换参数，不会重新挂载
watch(txId, (id, old) => {
  if (id && id !== old) loadTx()
})

async function loadTx() {
  loading.value = true
  actualGasEth.value = null
  try {
    const { tx: txData } = await getMultisigTx(txId.value)
    tx.value = txData
    const { owners: ownerList } = await getMultisigWalletOwners(txData.wallet_id)
    owners.value = ownerList

    if (txData.status === 'executed' && txData.tx_hash) {
      await fetchActualGas(txData)
    }
  } catch (err: any) {
    toast.add({ title: i18n.text['Error'] || 'Error', description: err.message, color: 'error' })
  } finally {
    loading.value = false
  }
}

async function fetchActualGas(txData: MultisigTx) {
  if (!txData.tx_hash) return
  loadingActualGas.value = true
  try {
    const chain = chainMap[txData.chain_id]
    if (!chain) return
    const result = await getActualGasFee(txData.tx_hash as `0x${string}`, chain)
    if (result !== null) {
      actualGasEth.value = result
    }
  } catch {
  } finally {
    loadingActualGas.value = false
  }
}

// ─── Sign flow ────────────────────────────────────────────────────────────────

function handleSign() {
  passcodeAction = 'sign'
  passcodeError.value = ''
  showPasscode.value = true
}

function handleExecute() {
  passcodeAction = 'execute'
  passcodeError.value = ''
  showPasscode.value = true
}

async function onPasscodeConfirm(passcode: string) {
  passcodeError.value = ''
  if (passcodeAction === 'sign') {
    await doSign(passcode)
  } else if (passcodeAction === 'execute') {
    await doExecute(passcode)
  } else if (passcodeAction === 'signGroup') {
    await doSignGroup(passcode)
  } else {
    await doExecuteGroup(passcode)
  }
}

function handleSignGroup() {
  passcodeAction = 'signGroup'
  passcodeError.value = ''
  showPasscode.value = true
}

function handleExecuteGroup() {
  passcodeAction = 'executeGroup'
  passcodeError.value = ''
  showPasscode.value = true
}

async function decryptPrivateKey(passcode: string): Promise<Hex> {
  const encryptedKeys = userStore.user?.encrypted_keys
  if (!encryptedKeys) throw new Error('No encrypted keys')
  const keystore = typeof encryptedKeys === 'string' ? JSON.parse(encryptedKeys) : encryptedKeys
  return (await keystoreToPrivateKey(keystore, passcode)) as Hex
}

function walletOf(t: MultisigTx) {
  const wallet = multisigStore.wallets.find((w) => w.id === t.wallet_id)
  if (!wallet) throw new Error(`${chainName(t.chain_id)}：你不是这条链上该数字身份的签名者`)
  return wallet
}

/**
 * 给一笔交易签名。第一个签名者负责建快照：owner / 门限用这笔交易所在链的
 * 钱包行——在还没部署的链上那就是初始配置，initCode 才算得出正确的地址。
 */
async function signOne(t: MultisigTx, privateKey: Hex) {
  const wallet = walletOf(t)
  let snapshot = t.user_op_snapshot
  let nonce: string | undefined

  if (!snapshot) {
    const chain = chainMap[t.chain_id]
    if (!chain) throw new Error('Unsupported chain')
    const { owners: rowOwners, threshold } = await getMultisigWalletOwners(wallet.id)
    snapshot = await buildMultisigUserOpSnapshot({
      safeAddress: wallet.safe_address,
      owners: rowOwners.map((o) => o.owner_address),
      threshold: t.current_threshold ?? threshold,
      chain,
      calls: buildCallsFromTx(t, wallet.safe_address),
    })
    nonce = snapshot.nonce
  }

  const { signer, signature } = await signSafeOpSnapshot(privateKey, snapshot)
  await submitMultisigSignature({
    multisig_tx_id: t.id,
    signer_address: signer,
    signature,
    nonce,
    user_op_snapshot: nonce ? snapshot : undefined,
  })
}

type ExecuteOutcome = { txHash: string } | { confirmPending: true; txHash: string }

/**
 * 执行一笔已收齐签名的交易并回写后端。拿到 txHash 之后链上已提交，
 * 后续任何失败都不能再把它标记为 failed。
 */
async function executeOne(t: MultisigTx): Promise<ExecuteOutcome> {
  const wallet = walletOf(t)
  let submittedTxHash: string | undefined
  let locked = false
  try {
    // 不代付的链（主网）由 Safe 自付 gas：锁定前先查余额，免得锁住后才失败
    if (t.user_op_snapshot && t.user_op_snapshot.sponsored === false) {
      const chain = chainMap[t.chain_id]
      const snap = t.user_op_snapshot
      const needWei =
        (BigInt(snap.verificationGasLimit) + BigInt(snap.callGasLimit) + BigInt(snap.preVerificationGas)) *
        BigInt(snap.maxFeePerGas)
      if (chain) {
        const balance = await getBalance(wallet.safe_address, chain)
        if (balance < needWei) {
          throw new Error(`${chainName(t.chain_id)} 不代付 gas，数字身份在该链上的 ETH 余额不足以支付手续费`)
        }
      }
    }

    const { tx: lockedTx } = await executeMultisigTx(t.id)
    locked = true
    if (!lockedTx.user_op_snapshot || !lockedTx.signatures) throw new Error('Missing snapshot/signatures')

    const chain = chainMap[lockedTx.user_op_snapshot.chainId]
    if (!chain) throw new Error('Unsupported chain')

    // 以当前 owner 集合 + 当前门限打包签名（与链上 checkSignatures 一致）
    const { owners: rowOwners } = await getMultisigWalletOwners(wallet.id)
    const currentOwnerSet = new Set(
      (lockedTx.current_owners || rowOwners.map((o) => o.owner_address)).map((a) => a.toLowerCase())
    )
    const eligibleSignatures = lockedTx.signatures.filter((s) =>
      currentOwnerSet.has(s.signer_address.toLowerCase())
    )
    const execThreshold = lockedTx.current_threshold ?? lockedTx.threshold_at_creation
    if (eligibleSignatures.length < execThreshold) {
      throw new Error(
        i18n.text['multisig.notEnoughCurrentSignatures'] ||
          '当前有效签名数不足（成员或门限已变更），请重新收集签名'
      )
    }

    const { txHash, actualGasCost } = await executeMultisigUserOp(
      lockedTx.user_op_snapshot,
      eligibleSignatures,
      execThreshold,
      chain
    )
    submittedTxHash = txHash // 链上已提交，越过此处不可再标记为 failed

    // gas 由 paymaster 代付，但实际成本记账给执行者（"最后一个用户"）
    // confirm 失败属于可恢复状态：交易已上链，绝不能因此把它标记为 failed
    try {
      await confirmMultisigTx({ multisig_tx_id: t.id, tx_hash: txHash, gas_used: actualGasCost })
    } catch (confirmErr: any) {
      console.error('[executeOne] confirm failed after on-chain success:', confirmErr)
      return { confirmPending: true, txHash }
    }

    // 与单签一致：执行成功后上传交易记录到常规交易表，使收款方能查到备注
    try {
      await uploadTransaction({
        tx_hash: txHash,
        gas_used: '0',
        status: 'success',
        chain: chain.name.toLowerCase(),
        data: '',
        memo: t.memo || '',
        sender_note: t.sender_note || '',
        sender_address: wallet.safe_address,
        receiver_address: t.call_detail?.to || '',
      })
    } catch (e) {
      console.error('[executeOne] Upload transaction failed:', e)
    }

    if (CONFIG_TYPES.includes(t.tx_type)) {
      await syncWalletRowFromChain(t)
    }
    return { txHash }
  } catch (err) {
    // 仅当链上从未提交（无 txHash）且后端已锁定时才标记失败
    if (!submittedTxHash && locked) {
      await failMultisigTx(t.id).catch(() => {})
    }
    throw err
  }
}

/** Check if an error is a passcode decryption failure */
function isWrongPasscodeError(err: any): boolean {
  // DOMException from SubtleCrypto.decrypt when AES-GCM tag verification fails
  if (err instanceof DOMException) return true
  const msg = (err?.message || err?.toString() || '').toLowerCase()
  return msg.includes('decrypt') || msg.includes('decryption') || msg.includes('invalid keystore') ||
    msg.includes('operation error') || msg.includes('operation-specific') || msg.includes('tag') ||
    msg.includes('authentication') || msg.includes('bad decrypt')
}

async function doSign(passcode: string) {
  if (!tx.value) return
  signing.value = true
  try {
    const privateKey = await decryptPrivateKey(passcode)
    await signOne(tx.value, privateKey)

    showPasscode.value = false
    toast.add({ title: i18n.text['multisig.signedSuccess'] || 'Signed!', color: 'success' })
    await loadTx()
  } catch (err: any) {
    if (isWrongPasscodeError(err)) {
      passcodeError.value = i18n.text['multisig.wrongPasscode'] || '支付码错误，请重新输入'
    } else {
      showPasscode.value = false
      toast.add({ title: i18n.text['Error'] || 'Error', description: err.message, color: 'error' })
    }
  } finally {
    signing.value = false
  }
}

async function doExecute(passcode: string) {
  if (!tx.value) return
  executing.value = true
  try {
    // 先验证支付码（不锁定后端状态），再执行
    await decryptPrivateKey(passcode)
    const outcome = await executeOne(tx.value)
    showPasscode.value = false

    if ('confirmPending' in outcome) {
      toast.add({
        title: i18n.text['multisig.confirmPending'] || '交易已上链，正在同步…',
        description: i18n.text['multisig.confirmPendingDesc'] || '稍后刷新即可，无需重新发起',
        color: 'warning',
      })
      await loadTx()
      return
    }

    if (await leaveIfNoLongerOwner(tx.value)) return
    toast.add({ title: i18n.text['Transfer Success'] || 'Executed!', color: 'success' })
    await loadTx()
  } catch (err: any) {
    if (isWrongPasscodeError(err)) {
      passcodeError.value = i18n.text['multisig.wrongPasscode'] || '支付码错误，请重新输入'
    } else {
      showPasscode.value = false
      toast.add({ title: i18n.text['Error'] || 'Error', description: err.message, color: 'error' })
      await loadTx()
    }
  } finally {
    executing.value = false
  }
}

/** 同组各链逐条处理，单链失败不影响其他链，最后汇总 */
async function runOnGroup(
  passcode: string,
  pick: (t: MultisigTx) => boolean,
  action: (t: MultisigTx, privateKey: Hex) => Promise<unknown>,
  successTitle: string
) {
  if (!tx.value) return
  groupAction.value = passcodeAction === 'signGroup' ? 'sign' : 'execute'
  try {
    const privateKey = await decryptPrivateKey(passcode)
    showPasscode.value = false

    const done: string[] = []
    const failed: string[] = []
    for (const g of groupTxs.value) {
      const name = chainName(g.chain_id)
      try {
        if (!multisigStore.wallets.some((w) => w.id === g.wallet_id)) continue
        const { tx: t } = await getMultisigTx(g.id)
        if (!pick(t)) continue
        await action(t, privateKey)
        done.push(name)
      } catch (err: any) {
        failed.push(`${name}：${err?.message || err}`)
      }
    }

    if (done.length) toast.add({ title: successTitle, description: done.join('、'), color: 'success' })
    if (failed.length) {
      toast.add({ title: i18n.text['multisig.someChainsFailed'] || '部分链未完成', description: failed.join('\n'), color: 'warning' })
    }
    if (!done.length && !failed.length) {
      toast.add({ title: i18n.text['multisig.nothingToDo'] || '没有可处理的链', color: 'neutral' })
    }

    if (tx.value && (await leaveIfNoLongerOwner(tx.value))) return
    await loadTx()
  } catch (err: any) {
    if (isWrongPasscodeError(err)) {
      passcodeError.value = i18n.text['multisig.wrongPasscode'] || '支付码错误，请重新输入'
    } else {
      showPasscode.value = false
      toast.add({ title: i18n.text['Error'] || 'Error', description: err.message, color: 'error' })
    }
  } finally {
    groupAction.value = null
  }
}

function hasSigned(t: MultisigTx): boolean {
  return !!t.signatures?.some((s) => s.signer_address.toLowerCase() === currentUserAddress.value)
}

async function doSignGroup(passcode: string) {
  await runOnGroup(
    passcode,
    (t) => ['queued', 'signing'].includes(t.status) && !hasSigned(t),
    signOne,
    i18n.text['multisig.signedChains'] || '已签名'
  )
}

async function doExecuteGroup(passcode: string) {
  await runOnGroup(
    passcode,
    (t) => t.status === 'ready',
    async (t) => {
      const outcome = await executeOne(t)
      if ('confirmPending' in outcome) throw new Error('交易已上链，后台同步中，稍后刷新')
    },
    i18n.text['multisig.executedChains'] || '已执行'
  )
}

// ─── Reset Executing ──────────────────────────────────────────────────────────

async function handleResetExecuting() {
  if (!tx.value) return
  const ok = window.confirm(i18n.text['multisig.confirmResetExecuting'] || '确认重置？交易将回到待执行状态，您可以重新执行。')
  if (!ok) return
  try {
    await resetExecutingMultisigTx(tx.value.id)
    toast.add({ title: i18n.text['multisig.resetSuccess'] || '已重置为待执行', color: 'success' })
    await loadTx()
  } catch (err: any) {
    toast.add({ title: i18n.text['Error'] || 'Error', description: err.message, color: 'error' })
  }
}

// ─── Withdraw ─────────────────────────────────────────────────────────────────

async function handleWithdraw() {
  if (!tx.value) return
  const ok = window.confirm(i18n.text['multisig.confirmWithdraw'] || 'Withdraw this transaction?')
  if (!ok) return
  try {
    await withdrawMultisigTx(tx.value.id)
    toast.add({ title: i18n.text['multisig.withdrawn'] || 'Withdrawn', color: 'success' })
    router.back()
  } catch (err: any) {
    toast.add({ title: i18n.text['Error'] || 'Error', description: err.message, color: 'error' })
  }
}

// ─── Propose Reject ───────────────────────────────────────────────────────────

function promptGoToPendingReject(rejectTxId: string): boolean {
  const msg =
    i18n.text['multisig.rejectAlreadyPendingConfirm'] ||
    'Someone already proposed a rejection for this transaction. Go sign that rejection instead?'
  if (!window.confirm(msg)) return false
  router.push(`/multisig/${rejectTxId}`)
  return true
}

async function handleProposeReject() {
  if (!tx.value || !canProposeReject.value) return

  if (tx.value.pending_reject_tx_id) {
    promptGoToPendingReject(tx.value.pending_reject_tx_id)
    return
  }

  const ok = window.confirm(
    i18n.text['multisig.confirmProposeReject']
      || 'Propose a rejection? Uses the same Nonce as this transaction and competes with it — no need to wait for it to finish.'
  )
  if (!ok) return
  try {
    const wallet = walletRow.value
    if (!wallet) throw new Error('No active wallet')
    const chain = chainMap[tx.value.chain_id]
    if (!chain) throw new Error('Unsupported chain')
    if (!tx.value.nonce) throw new Error('Target transaction has no locked nonce')

    const ownerAddresses = owners.value.map((o) => o.owner_address)
    const safeAddress = wallet.safe_address as `0x${string}`

    const snapshot = await buildMultisigUserOpSnapshot({
      safeAddress,
      owners: ownerAddresses,
      threshold: effectiveThreshold.value,
      chain,
      forcedNonce: BigInt(tx.value.nonce),
      calls: [{ to: safeAddress, value: 0n, data: '0x' }],
    })

    const { tx: cancelTx } = await proposeMultisigTx({
      wallet_id: tx.value.wallet_id,
      tx_type: 'cancel',
      call_detail: { replaces_tx_id: tx.value.id, reason: 'on-chain rejection' },
      evm_call_data: '0x',
      replaces_tx_id: tx.value.id,
      user_op_snapshot: snapshot,
    })

    toast.add({ title: i18n.text['multisig.rejectProposed'] || 'Reject transaction proposed', color: 'success' })
    router.push(`/multisig/${cancelTx.id}`)
  } catch (err: unknown) {
    if (err instanceof MultisigApiError) {
      if (err.code === 'reject_already_pending' && err.reject_tx_id) {
        promptGoToPendingReject(err.reject_tx_id)
        return
      }
      if (err.code === 'reject_not_signing') {
        toast.add({
          title: i18n.text['multisig.rejectNotSigningTitle'] || 'Cannot reject yet',
          description:
            i18n.text['multisig.rejectNotSigningBody'] ||
            err.message,
          color: 'warning',
        })
        return
      }
      if (err.code === 'reject_target_is_cancel') {
        toast.add({
          title: i18n.text['Error'] || 'Error',
          description:
            i18n.text['multisig.rejectTargetIsCancel'] ||
            'Cannot propose rejection for a rejection transaction.',
          color: 'error',
        })
        return
      }
    }
    const message = err instanceof Error ? err.message : String(err)
    toast.add({ title: i18n.text['Error'] || 'Error', description: message, color: 'error' })
  }
}

// ─── Resubmit (failed) ────────────────────────────────────────────────────────

async function handleResubmit() {
  if (!tx.value) return
  try {
    const { tx: newTx } = await proposeMultisigTx({
      wallet_id: tx.value.wallet_id,
      tx_type: tx.value.tx_type,
      call_detail: tx.value.call_detail,
      evm_call_data: tx.value.evm_call_data,
    })
    toast.add({ title: i18n.text['multisig.resubmitted'] || 'Resubmitted', color: 'success' })
    router.push(`/multisig/${newTx.id}`)
  } catch (err: any) {
    toast.add({ title: i18n.text['Error'] || 'Error', description: err.message, color: 'error' })
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * 配置类交易执行后，以该链上真实 owner/threshold 刷新后端镜像。
 * 读取失败不阻断：后端 apply_wallet_config 已基于 call_detail 更新，
 * 用户仍可手动「从链上同步」兜底。
 */
async function syncWalletRowFromChain(t: MultisigTx) {
  try {
    const chain = chainMap[t.chain_id]
    const wallet = multisigStore.wallets.find((w) => w.id === t.wallet_id)
    if (!chain || !wallet) return
    const { owners: chainOwners, threshold: chainThreshold } =
      await getSafeOwnersAndThreshold(wallet.safe_address as Address, chain)
    await syncMultisigWallet({ wallet_id: t.wallet_id, owners: chainOwners, threshold: chainThreshold })
  } catch {}
}

/** 执行配置变更后刷新钱包列表；当前用户已被移出当前钱包时返回首页。返回是否已离开。 */
async function leaveIfNoLongerOwner(t: MultisigTx): Promise<boolean> {
  if (!CONFIG_TYPES.includes(t.tx_type)) return false
  const walletId = multisigStore.activeWalletId
  await multisigStore.fetchWallets()

  const removedAddr = t.call_detail?.owner?.toLowerCase?.() || t.call_detail?.old_owner?.toLowerCase?.()
  const removedSelf = removedAddr && removedAddr === currentUserAddress.value
  if ((removedSelf && walletId === t.wallet_id) || (walletId && !multisigStore.wallets.some((w) => w.id === walletId))) {
    multisigStore.setActiveWallet(null)
    toast.add({ title: i18n.text['multisig.removedFromWallet'] || 'Removed from wallet', color: 'warning' })
    router.push('/')
    return true
  }
  return false
}

function buildCallsFromTx(t: MultisigTx, safe: Address): { to: `0x${string}`; value?: bigint; data?: `0x${string}` }[] {
  if (t.tx_type === 'cancel') {
    return [{ to: safe, value: 0n, data: '0x' }]
  }

  let calls: { to: `0x${string}`; value?: bigint; data?: `0x${string}` }[] = []

  if (t.tx_type === 'transfer' && t.call_detail.to) {
    const ethAmount = String(t.call_detail.amount || '0')
    // 精确字符串转换，避免 parseFloat(...)*1e18 在 >2^53 wei 时丢精度
    const weiValue = parseEther(ethAmount)
    calls = [{ to: t.call_detail.to as `0x${string}`, value: weiValue }]
  } else if (t.tx_type === 'erc20_transfer' && t.call_detail.token_address && t.evm_call_data) {
    // ERC-20 代币转账：to 必须是代币合约地址，data 是 transfer(recipient, amount) 编码
    calls = [{
      to: t.call_detail.token_address as `0x${string}`,
      data: t.evm_call_data as `0x${string}`,
      value: 0n,
    }]
  } else if (t.evm_call_data) {
    // 其他类型（如配置变更等）：to 为 Safe 自身地址
    calls = [{ to: safe, data: t.evm_call_data as `0x${string}`, value: 0n }]
  }

  // 附加备注上链调用（与单签一致，通过 Remark Proxy saveRemark）
  if (t.call_detail.remark_to && t.call_detail.remark_data) {
    calls.push({
      to: t.call_detail.remark_to as `0x${string}`,
      data: t.call_detail.remark_data as `0x${string}`,
      value: 0n,
    })
  }

  return calls
}

function abbr(address?: string): string {
  if (!address || address.length < 10) return address || '—'
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString()
}

async function copyTxHash() {
  if (tx.value?.tx_hash) {
    await navigator.clipboard.writeText(tx.value.tx_hash)
    toast.add({ title: i18n.text['Copy Success'] || 'Copied', color: 'success' })
  }
}
</script>
