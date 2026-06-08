<template>
  <div class="flex flex-col container-size h-[100vh] rounded-xl bg-[var(--ui-bg)] shadow-lg px-4 py-6 banner">
    <!-- Top bar (matches Profile.client.vue) -->
    <div class="w-full flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <NetworkSwitch />
        <AddressDisplay :address="activeWallet?.safe_address || ''" />
      </div>
      <div class="flex items-center gap-4">
        <UIcon name="ci:notebook" size="26" class="cursor-pointer hover:text-primary-500" @click="navigateTo('/contacts')" />
        <ProfileSettings />
      </div>
    </div>

    <!-- Wallet name + threshold badge -->
    <div class="flex items-center justify-between gap-2 mb-2">
      <div class="flex items-center gap-2">
        <span class="text-lg font-semibold text-gray-800">{{ activeWallet?.name }}</span>
        <span class="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full font-medium">
          {{ activeWallet?.threshold }}/{{ ownerCount }} {{ i18n.text['multisig.multisig'] }}
        </span>
      </div>
      <UButton
        size="xs"
        variant="soft"
        color="gray"
        @click="router.push('/multisig/owners')"
      >
        {{ i18n.text['multisig.ownerManagement'] }}
      </UButton>
    </div>

    <!-- Balance -->
    <div class="mb-4 space-y-3">
      <div class="bg-white rounded-xl border border-gray-100 p-4">
        <p class="text-xs text-gray-400 mb-1">ETH</p>
        <p class="text-2xl font-bold text-gray-800">
          {{ displayBalance(ethBalance, 6, 18) }}
        </p>
        <p class="text-xs text-gray-400 font-mono mt-2">{{ activeWallet?.safe_address }}</p>
      </div>

      <div v-if="tokenBalances.length" class="bg-white rounded-xl border border-gray-100 divide-y divide-gray-100">
        <div
          v-for="b in tokenBalances"
          :key="b.token.address"
          class="flex items-center justify-between px-4 py-3"
        >
          <div class="flex items-center gap-3">
            <img v-if="b.token.image_url" :src="b.token.image_url" class="w-9 h-9 rounded-full" />
            <div v-else class="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm">🪙</div>
            <div>
              <div class="font-medium">{{ b.token.symbol }}</div>
              <div class="text-gray-400 text-sm">{{ b.token.name }}</div>
            </div>
          </div>
          <div class="flex flex-col items-end">
            <span class="font-medium">{{ displayBalance(b.balance, 6, b.token.decimals) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex gap-1 border-b border-gray-100 mb-3">
      <button
        class="px-4 py-2 text-sm font-medium transition-colors border-b-2"
        :class="tab === 'queue' ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500'"
        @click="tab = 'queue'; fetchQueue()"
      >
        {{ i18n.text['multisig.queue'] }} <span v-if="queueTxs.length">({{ queueTxs.length }})</span>
      </button>
      <button
        class="px-4 py-2 text-sm font-medium transition-colors border-b-2"
        :class="tab === 'history' ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500'"
        @click="tab = 'history'; fetchHistory()"
      >
        {{ i18n.text['multisig.history'] }}
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex flex-col gap-3 mt-2">
      <div class="w-full h-24 rounded-xl loading-bg" />
      <div class="w-full h-24 rounded-xl loading-bg" />
    </div>

    <!-- Queue tab -->
    <div v-else-if="tab === 'queue'" class="flex-1 overflow-y-auto space-y-3 pb-20">
      <div v-if="!queueTxs.length" class="text-center text-gray-400 text-sm mt-12">
        {{ i18n.text['multisig.noQueuedTxs'] }}
      </div>

      <div
        v-for="tx in queueTxs"
        :key="tx.id"
        class="rounded-xl border cursor-pointer transition-all"
        :class="isActionable(tx) ? 'bg-white border-l-4 border-primary-400 shadow-sm' : 'bg-gray-50 border-gray-200 border-l-4 border-l-gray-300'"
        @click="router.push(`/multisig/${tx.id}`)"
      >
        <div class="p-4 space-y-3">
          <!-- Header row -->
          <div class="flex items-start justify-between">
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-lg">{{ txIcon(tx) }}</span>
                <span class="text-sm font-semibold text-gray-800">{{ txLabel(tx) }}</span>
                <span
                  v-if="isCompeting(tx)"
                  class="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium"
                >
                  {{ i18n.text['multisig.sameNonceCompeting'] || 'Same Nonce' }}
                </span>
              </div>
              <p class="text-xs text-gray-400 mt-0.5">
                {{ i18n.text['multisig.proposedBy'] }} {{ tx.proposer?.name || '' }}
                <CopyableAddress v-if="tx.proposer?.address" :address="tx.proposer.address" /> · {{ timeAgo(tx.created_at) }}
              </p>
            </div>
            <span
              class="text-xs px-2 py-0.5 rounded-full font-medium"
              :class="statusClass(tx.status)"
            >
              {{ i18n.text['multisig.status.' + tx.status] || tx.status }}
            </span>
          </div>

          <!-- Progress bar -->
          <div v-if="isActionable(tx)">
            <SignatureProgress
              :owners="owners"
              :signatures="tx.signatures || []"
              :signed-count="tx.eligible_signature_count ?? tx.signature_count"
              :threshold="tx.current_threshold ?? tx.threshold_at_creation"
              :proposal-threshold="tx.threshold_at_creation"
              :show-list="false"
            />
          </div>
          <div v-else class="text-xs text-gray-400">
            {{ (i18n.text['multisig.queuePosition'] || 'Queue position #{n}').replace('{n}', String(tx.queue_position)) }}
          </div>

          <!-- Action buttons (front of queue only) -->
          <div v-if="isActionable(tx)" class="flex items-center gap-2" @click.stop>
            <template v-if="tx.status === 'ready'">
              <UButton size="sm" color="green" :loading="executing && executingTx?.id === tx.id" :disabled="executing" @click="handleExecute(tx)">
                {{ i18n.text['multisig.executeTransaction'] }}
              </UButton>
            </template>
            <template v-else-if="!hasCurrentUserSigned(tx)">
              <UButton size="sm" :disabled="executing" @click="router.push(`/multisig/${tx.id}`)">
                {{ i18n.text['multisig.goToSign'] }}
              </UButton>
            </template>
            <template v-else>
              <span class="text-sm text-gray-400">✓ {{ i18n.text['multisig.alreadySigned'] }}</span>
            </template>

            <button
              v-if="tx.tx_type !== 'cancel' && (tx.status === 'signing' || tx.status === 'ready')"
              class="text-xs text-primary-500 underline disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="executing"
              @click.stop="goRejectAction(tx)"
            >
              {{
                tx.pending_reject_tx_id
                  ? (i18n.text['multisig.goSignPendingReject'] || 'Sign pending rejection')
                  : (i18n.text['multisig.proposeReject'] || 'Propose rejection')
              }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- History tab -->
    <div v-else class="flex-1 overflow-y-auto space-y-3 pb-20">
      <!-- Filter tabs -->
      <div class="flex gap-2 mb-3">
        <button
          v-for="f in historyFilters"
          :key="f.key"
          class="px-3 py-1 text-xs font-medium rounded-full transition-colors border"
          :class="historyFilter === f.key ? f.activeClass : 'border-gray-200 text-gray-500 bg-white'"
          @click="historyFilter = f.key"
        >
          {{ f.label }}
        </button>
      </div>

      <div v-if="!filteredHistoryTxs.length" class="text-center text-gray-400 text-sm mt-12">
        {{ i18n.text['multisig.noHistory'] }}
      </div>
      <div
        v-for="item in filteredHistoryTxs"
        :key="item.id"
        class="bg-white rounded-xl border border-gray-100 p-4 cursor-pointer hover:shadow-sm transition-all"
        :class="{ 'border-l-4 border-l-yellow-400': item._type === 'incoming' }"
        @click="item._type === 'incoming' ? (selectedIncoming = item as IncomingTx, showIncomingDetail = true) : router.push(`/multisig/${item.id}`)"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-lg">{{ item._type === 'incoming' ? '📥' : txIcon(item as any) }}</span>
            <div>
              <p class="text-sm font-medium text-gray-800">
                {{ item._type === 'incoming' ? (i18n.text['multisig.incomingTransfer'] || '收款') : txLabel(item as any) }}
              </p>
              <p class="text-xs text-gray-400">
                <template v-if="item._type === 'incoming'">
                  {{ i18n.text['FROM'] }} <CopyableAddress :address="(item as IncomingTx).from" /> · {{ timeAgo((item as IncomingTx).timestamp) }}
                </template>
                <template v-else>
                  {{ timeAgo((item as MultisigTx).created_at) }}
                </template>
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <template v-if="item._type === 'incoming'">
              <span class="text-sm font-semibold text-green-600">
                +{{ (item as IncomingTx).amount }} {{ (item as IncomingTx).symbol }}
              </span>
            </template>
            <template v-else>
              <span class="text-xs px-2 py-0.5 rounded-full font-medium" :class="statusClass((item as MultisigTx).status)">
                {{ i18n.text['multisig.status.' + (item as MultisigTx).status] || (item as MultisigTx).status }}
              </span>
            </template>
          </div>
        </div>
        <!-- Memo/Sender Note display (only for outgoing proposals) -->
        <div v-if="item._type !== 'incoming' && ((item as MultisigTx).memo || (item as MultisigTx).sender_note)" class="mt-2 space-y-1">
          <p v-if="(item as MultisigTx).memo" class="text-xs text-gray-500 flex items-center gap-1">
            <UIcon name="ci:chat-alt" size="12" />
            {{ (item as MultisigTx).memo }}
          </p>
          <p v-if="(item as MultisigTx).sender_note" class="text-xs text-blue-500 flex items-center gap-1">
            <UIcon name="ci:chat-alt-check" size="12" />
            {{ (item as MultisigTx).sender_note }}
          </p>
        </div>
        <!-- Incoming: memo display -->
        <div v-if="item._type === 'incoming'" class="mt-2">
          <p v-if="(item as IncomingTx).memo" class="text-xs text-gray-500 flex items-center gap-1">
            <UIcon name="ci:chat-alt" size="12" />
            {{ (item as IncomingTx).memo }}
          </p>
          <p v-else class="text-xs text-gray-400">-</p>
        </div>
        <div v-if="(item._type === 'incoming' && (item as IncomingTx).tx_hash) || (item._type !== 'incoming' && (item as MultisigTx).tx_hash)" class="mt-2 flex justify-end">
          <button
            class="text-xs text-primary-500 hover:text-primary-700 transition-colors"
            @click.stop="toExplorer((item as any).tx_hash!)"
          >
            {{ i18n.text['multisig.viewOnChain'] || '链上查询->' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Floating propose button -->
    <button
      class="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-primary-500 text-white shadow-lg flex items-center justify-center text-2xl hover:bg-primary-600 transition-colors z-10"
      @click="router.push('/transfer')"
    >
      +
    </button>

    <!-- Incoming transfer detail modal -->
    <div v-if="showIncomingDetail && selectedIncoming" class="fixed inset-0 z-50 flex items-center justify-center" @click.self="showIncomingDetail = false">
      <div class="absolute inset-0 bg-black/40" @click="showIncomingDetail = false" />
      <div class="relative w-full max-w-sm mx-4 bg-white rounded-2xl shadow-xl p-5 max-h-[85vh] overflow-y-auto">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-base font-semibold text-gray-800">
            {{ i18n.text['multisig.incomingTransfer'] || '收款' }}
          </h3>
          <button class="text-gray-400 hover:text-gray-600" @click="showIncomingDetail = false">
            <UIcon name="ci:close-md" size="18" />
          </button>
        </div>

        <div class="space-y-3">
          <div class="flex justify-between items-center">
            <span class="text-sm text-gray-500">{{ i18n.text['multisig.type'] }}</span>
            <span class="text-sm font-medium text-green-600">{{ i18n.text['multisig.incomingTransfer'] || '收款' }}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-sm text-gray-500">{{ i18n.text['FROM'] }}</span>
            <CopyableAddress :address="selectedIncoming.from" text-class="text-sm" />
          </div>
          <div class="flex justify-between items-center">
            <span class="text-sm text-gray-500">{{ i18n.text['To'] }}</span>
            <CopyableAddress :address="selectedIncoming.to" text-class="text-sm" />
          </div>
          <div class="flex justify-between">
            <span class="text-sm text-gray-500">{{ i18n.text['multisig.amount'] }}</span>
            <span class="text-sm font-semibold text-green-600">+{{ selectedIncoming.amount }} {{ selectedIncoming.symbol }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-sm text-gray-500">{{ i18n.text['multisig.nonce'] || 'Time' }}</span>
            <span class="text-sm text-gray-600">{{ formatDate(selectedIncoming.timestamp) }}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-sm text-gray-500">{{ i18n.text['Memo'] }}</span>
            <span class="text-sm text-gray-700 max-w-[60%] text-right break-all">{{ selectedIncoming.memo || '-' }}</span>
          </div>
        </div>

        <div v-if="selectedIncoming.tx_hash" class="mt-4 pt-3 border-t border-gray-100 flex justify-end">
          <button
            class="text-sm text-primary-500 hover:text-primary-700 transition-colors"
            @click="toExplorer(selectedIncoming.tx_hash!)"
          >
            {{ i18n.text['multisig.viewOnChain'] || '链上查询->' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Passcode modal for execute -->
    <PasscodeModal
      v-if="showPasscode"
      :error-message="passcodeError"
      @confirm="onExecutePasscode"
      @cancel="showPasscode = false; passcodeError = ''"
    />
  </div>
</template>

<script setup lang="ts">
import { useMultisigStore } from '~/stores/multisig'
import { useUserStore } from '~/stores/user'
import { useChainStore } from '~/stores/chain'
import { useI18n } from '~/stores/i18n'
import { getMultisigWalletOwners, getMultisigTxs, executeMultisigTx, confirmMultisigTx, failMultisigTx, resetExecutingMultisigTx, syncMultisigWallet, lookupMultisigTxMemos } from '~/utils/multisig_api'
import { executeMultisigUserOp, getSafeOwnersAndThreshold } from '~/utils/SafeSmartAccount/multisig'
import { keystoreToPrivateKey } from '~/utils/encryption'
import { chainMap } from '~/stores/chain'
import type { MultisigTx, MultisigOwner } from '~/utils/multisig_api'
import { getBalance, getPopularERC20Balance, type ERC20Balance } from '~/utils/balance'
import { uploadTransaction } from '~/utils/semi_api'
import { displayBalance } from '~/utils/display'
import { getTokenClass } from '~/utils/semi_api'
import { getReceiveActions } from '~/utils/actions'

/** Incoming transfer record for multisig wallet history */
interface IncomingTx {
  id: string
  _type: 'incoming'
  from: string
  to: string
  amount: string
  symbol: string
  tx_hash: string | null
  timestamp: string
  memo?: string | null
}

type HistoryItem = MultisigTx | IncomingTx

const router = useRouter()
const multisigStore = useMultisigStore()
const userStore = useUserStore()
const chainStore = useChainStore()
const i18n = useI18n()
const toast = useToast()

const tab = ref<'queue' | 'history'>('queue')
const loading = ref(false)
const queueTxs = ref<MultisigTx[]>([])
const historyTxs = ref<MultisigTx[]>([])
const incomingTxs = ref<IncomingTx[]>([])
const historyFilter = ref<'all' | 'success' | 'failed' | 'incoming'>('all')
const owners = ref<MultisigOwner[]>([])
const ownerCount = ref(0)
const showPasscode = ref(false)
const passcodeError = ref('')
const executing = ref(false)
let executingTx: MultisigTx | null = null
const showIncomingDetail = ref(false)
const selectedIncoming = ref<IncomingTx | null>(null)

const activeWallet = computed(() => multisigStore.activeWallet)
const currentUserAddress = computed(() => userStore.user?.evm_chain_active_key?.toLowerCase() || '')

// Balances
const ethBalance = ref<bigint>(0n)
const tokenBalances = ref<ERC20Balance[]>([])

// History filter tabs
const historyFilters = computed(() => [
  { key: 'all' as const, label: i18n.text['multisig.filterAll'] || '全部', activeClass: 'border-gray-400 text-gray-700 bg-gray-50' },
  { key: 'success' as const, label: i18n.text['multisig.filterSuccess'] || '成功', activeClass: 'border-green-400 text-green-700 bg-green-50' },
  { key: 'failed' as const, label: i18n.text['multisig.filterFailed'] || '失败', activeClass: 'border-red-400 text-red-700 bg-red-50' },
  { key: 'incoming' as const, label: i18n.text['multisig.filterIncoming'] || '收款', activeClass: 'border-yellow-400 text-yellow-700 bg-yellow-50' },
])

/** Merged and sorted history items (outgoing proposals + incoming transfers) */
const mergedHistory = computed<HistoryItem[]>(() => {
  const items: HistoryItem[] = [...historyTxs.value, ...incomingTxs.value]
  items.sort((a, b) => {
    const timeA = a._type === 'incoming' ? new Date((a as IncomingTx).timestamp).getTime() : new Date((a as MultisigTx).created_at).getTime()
    const timeB = b._type === 'incoming' ? new Date((b as IncomingTx).timestamp).getTime() : new Date((b as MultisigTx).created_at).getTime()
    return timeB - timeA
  })
  return items
})

const FAILED_STATUSES = ['failed', 'withdrawn', 'superseded', 'expired']

/** Filtered history based on selected filter */
const filteredHistoryTxs = computed<HistoryItem[]>(() => {
  const filter = historyFilter.value
  if (filter === 'all') return mergedHistory.value
  if (filter === 'success') return mergedHistory.value.filter(item => item._type !== 'incoming' && (item as MultisigTx).status === 'executed')
  if (filter === 'failed') return mergedHistory.value.filter(item => item._type !== 'incoming' && FAILED_STATUSES.includes((item as MultisigTx).status))
  if (filter === 'incoming') return mergedHistory.value.filter(item => item._type === 'incoming')
  return mergedHistory.value
})
async function fetchBalances() {
  if (!activeWallet.value?.safe_address) return
  try {
    const chain = chainStore.chain
    ethBalance.value = await getBalance(activeWallet.value.safe_address, chain)

    const { token_classes } = await getTokenClass()
    const currentTokenClasses = token_classes.filter((t) => t.chain_id === chain.id)
    tokenBalances.value = (
      await getPopularERC20Balance(currentTokenClasses, activeWallet.value.safe_address, chain)
    ).sort((a, b) => Number(b.token.position - a.token.position))
  } catch (e) {
    console.error(e)
    tokenBalances.value = []
  }
}

// ─── Load data ────────────────────────────────────────────────────────────────

onMounted(async () => {
  if (!activeWallet.value) {
    router.push('/')
    return
  }
  await Promise.all([fetchQueue(), fetchOwners(), fetchBalances()])
})

onActivated(async () => {
  if (!activeWallet.value) return
  await fetchQueue()
})

watch([activeWallet, () => chainStore.chain], () => {
  fetchBalances()
  fetchQueue()
  fetchOwners()
  // 如果当前在历史标签页，也刷新历史
  if (tab.value === 'history') {
    fetchHistory()
  }
})

async function fetchOwners() {
  if (!activeWallet.value) return
  try {
    const { owners: ownerList, threshold } = await getMultisigWalletOwners(activeWallet.value.id)
    owners.value = ownerList
    ownerCount.value = ownerList.length
  } catch (e) {
    console.error(e)
  }
}

async function fetchQueue() {
  if (!activeWallet.value) return
  loading.value = true
  try {
    const { txs } = await getMultisigTxs(activeWallet.value.id, 'queue')
    queueTxs.value = txs
    multisigStore.queueTxs = txs
    multisigStore.updateBadge(currentUserAddress.value)
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

async function fetchHistory() {
  if (!activeWallet.value) return
  loading.value = true
  try {
    const [historyResult] = await Promise.all([
      getMultisigTxs(activeWallet.value.id, 'history'),
      fetchIncomingTxs(),
    ])
    historyTxs.value = historyResult.txs
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

async function fetchIncomingTxs() {
  if (!activeWallet.value?.safe_address) return
  try {
    const chain = chainStore.chain
    const { token_classes } = await getTokenClass()
    const currentTokenClasses = token_classes.filter((t) => t.chain_id === chain.id)
    const actions = await getReceiveActions(activeWallet.value.safe_address, chain, currentTokenClasses)
    incomingTxs.value = actions.map((a: any) => ({
      id: `incoming-${a.txHex || Math.random().toString(36).slice(2)}`,
      _type: 'incoming' as const,
      from: a.from || '',
      to: activeWallet.value!.safe_address,
      amount: displayBalance(a.value, 6, a.decimals || 18),
      symbol: a.symbol || chain.nativeCurrency.symbol,
      tx_hash: a.txHex || null,
      timestamp: a.date || new Date().toISOString(),
      memo: null as string | null,
    }))

    // 通过 tx_hash 从后端查找备注（与单签通过 getTransactions 匹配逻辑一致）
    const txHashes = incomingTxs.value.map(tx => tx.tx_hash).filter(Boolean) as string[]
    if (txHashes.length > 0) {
      try {
        console.log('[fetchIncomingTxs] Looking up memos for tx_hashes:', txHashes)
        const { memos } = await lookupMultisigTxMemos(txHashes)
        console.log('[fetchIncomingTxs] Memos response:', JSON.stringify(memos))
        // 后端返回的 key 是小写 tx_hash，前端也用小写匹配
        const lowerMemos: Record<string, { memo: string | null; sender_note: string | null }> = {}
        for (const [k, v] of Object.entries(memos)) {
          lowerMemos[k.toLowerCase()] = v
        }
        incomingTxs.value.forEach(tx => {
          if (tx.tx_hash) {
            const match = lowerMemos[tx.tx_hash.toLowerCase()]
            console.log(`[fetchIncomingTxs] Matching ${tx.tx_hash.toLowerCase()}:`, match)
            if (match?.memo) tx.memo = match.memo
          }
        })
      } catch (e) {
        console.error('[fetchIncomingTxs] Memo lookup failed:', e)
      }
    }
  } catch (e) {
    console.error('Failed to fetch incoming transactions:', e)
    incomingTxs.value = []
  }
}

// ─── Queue helpers ────────────────────────────────────────────────────────────

function isFront(tx: MultisigTx): boolean {
  const positions = queueTxs.value.map((t) => t.queue_position).filter((p): p is number => p !== null)
  if (!positions.length) return false
  return tx.queue_position === Math.min(...positions)
}

function isCompeting(tx: MultisigTx): boolean {
  return !!tx.replaces_tx_id && tx.queue_position == null
}

/** 队首普通交易，或同 Nonce 竞争中的拒签交易 */
function isActionable(tx: MultisigTx): boolean {
  if (isCompeting(tx)) {
    return tx.status === 'signing' || tx.status === 'ready'
  }
  return isFront(tx)
}

function goRejectAction(tx: MultisigTx) {
  if (tx.pending_reject_tx_id) {
    router.push(`/multisig/${tx.pending_reject_tx_id}`)
  } else {
    router.push(`/multisig/${tx.id}`)
  }
}

function hasCurrentUserSigned(tx: MultisigTx): boolean {
  const addr = currentUserAddress.value
  if (!addr) return false
  if (tx.signatures?.some((s) => s.signer_address.toLowerCase() === addr)) return true
  return tx.signer_addresses?.some((s) => s.toLowerCase() === addr) ?? false
}

// ─── Execute flow ─────────────────────────────────────────────────────────────

function handleExecute(tx: MultisigTx) {
  executingTx = tx
  passcodeError.value = ''
  showPasscode.value = true
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

async function onExecutePasscode(passcode: string) {
  passcodeError.value = ''
  if (!executingTx) return
  const tx = executingTx
  executing.value = true
  // 一旦拿到 txHash，链上已提交成功，无论后续 confirm/上传是否失败都不能再标记为 failed
  let submittedTxHash: string | undefined

  try {
    // 1. 先验证支付码是否正确（不锁定后端状态）
    const encryptedKeys = userStore.user?.encrypted_keys
    if (!encryptedKeys) throw new Error('No encrypted keys')
    const keystore = typeof encryptedKeys === 'string' ? JSON.parse(encryptedKeys) : encryptedKeys
    await keystoreToPrivateKey(keystore, passcode)

    // 2. 支付码正确，锁定后端状态
    const { tx: lockedTx } = await executeMultisigTx(tx.id)
    if (!lockedTx.user_op_snapshot || !lockedTx.signatures) throw new Error('Missing snapshot or signatures')

    const chain = chainMap[lockedTx.user_op_snapshot.chainId]
    if (!chain) throw new Error('Unsupported chain')

    // 以当前 owner 集合 + 当前门限打包签名（与链上 checkSignatures 一致）
    const currentOwnerSet = new Set(
      (lockedTx.current_owners || owners.value.map((o) => o.owner_address)).map((a) => a.toLowerCase())
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
      await confirmMultisigTx({ multisig_tx_id: tx.id, tx_hash: txHash, gas_used: actualGasCost })
    } catch (confirmErr: any) {
      console.error('[execute] confirm failed after on-chain success:', confirmErr)
      showPasscode.value = false
      toast.add({
        title: i18n.text['multisig.confirmPending'] || '交易已上链，正在同步…',
        description: i18n.text['multisig.confirmPendingDesc'] || '稍后刷新即可，无需重新发起',
        color: 'warning',
      })
      await fetchQueue()
      return
    }

    // 与单签一致：执行成功后上传交易记录到常规交易表，使收款方能查到备注
    try {
      const safeAddress = multisigStore.activeWallet?.safe_address || ''
      console.log('[execute] Uploading transaction with memo:', tx.memo, 'sender_note:', tx.sender_note, 'tx_hash:', txHash)
      await uploadTransaction({
        tx_hash: txHash,
        gas_used: '0',
        status: 'success',
        chain: chain.name.toLowerCase(),
        data: '',
        memo: tx.memo || '',
        sender_note: tx.sender_note || '',
        sender_address: safeAddress,
        receiver_address: tx.call_detail?.to || '',
      })
      console.log('[execute] Upload transaction success')
    } catch (e) {
      console.error('[execute] Upload transaction failed:', e)
    }

    if (['add_owner', 'remove_owner', 'change_threshold', 'replace_owner'].includes(tx.tx_type)) {
      const walletId = multisigStore.activeWalletId
      // 配置类交易执行后，以链上真实状态刷新后端 DB 镜像，保证队列门限即时一致
      try {
        const safeAddress = multisigStore.activeWallet?.safe_address
        if (safeAddress) {
          const { owners: chainOwners, threshold: chainThreshold } =
            await getSafeOwnersAndThreshold(safeAddress as `0x${string}`, chain)
          await syncMultisigWallet({
            wallet_id: tx.wallet_id,
            owners: chainOwners,
            threshold: chainThreshold,
          })
        }
      } catch {
        // 链上读取失败不阻断；后端已基于 call_detail 更新镜像，可手动「从链上同步」兜底
      }
      await multisigStore.fetchWallets()
      const removedAddr = tx.call_detail?.owner?.toLowerCase?.()
      if (tx.tx_type === 'remove_owner' && removedAddr === currentUserAddress.value) {
        multisigStore.setActiveWallet(null)
        router.push('/')
        return
      }
      if (walletId && !multisigStore.wallets.some((w) => w.id === walletId)) {
        multisigStore.setActiveWallet(null)
        router.push('/')
        return
      }
    }
    showPasscode.value = false
    toast.add({ title: i18n.text['Transfer Success'] || 'Success', description: txHash, color: 'success' })
    await fetchQueue()
  } catch (err: any) {
    if (isWrongPasscodeError(err)) {
      passcodeError.value = i18n.text['multisig.wrongPasscode'] || '支付码错误，请重新输入'
      // 密码错误时后端状态不会被锁定，无需重置
    } else {
      showPasscode.value = false
      // 仅当链上从未提交（无 txHash）时才标记失败；
      // 已上链的交易即使后续步骤失败也绝不能标记为 failed（否则会诱导重复发起 → 双花）
      if (!submittedTxHash) {
        await failMultisigTx(tx.id).catch(() => {})
      }
      toast.add({ title: i18n.text['Error'] || 'Error', description: err.message, color: 'error' })
    }
    await fetchQueue()
  } finally {
    executing.value = false
    executingTx = null
  }
}

// ─── Display helpers ─────────────────────────────────────────────────────────

function txIcon(tx: MultisigTx): string {
  const icons: Record<string, string> = {
    transfer: '💸', erc20_transfer: '🪙', add_owner: '👥', remove_owner: '🚫',
    change_threshold: '🔧', cancel: '❌', replace_owner: '🔄'
  }
  return icons[tx.tx_type] || '📝'
}

function txLabel(tx: MultisigTx): string {
  const labels: Record<string, string> = {
    transfer: i18n.text['multisig.transferEth'] || 'ETH Transfer',
    erc20_transfer: i18n.text['multisig.transferToken'] || 'Token Transfer',
    add_owner: i18n.text['multisig.addOwner'] || 'Add Owner',
    remove_owner: i18n.text['multisig.removeOwner'] || 'Remove Owner',
    change_threshold: i18n.text['multisig.changeThreshold'] || 'Change Threshold',
    cancel: i18n.text['multisig.rejectTransaction'] || 'Reject Transaction',
    replace_owner: i18n.text['multisig.replaceOwner'] || 'Replace Signer',
  }
  const base = labels[tx.tx_type] || tx.tx_type
  if ((tx.tx_type === 'transfer' || tx.tx_type === 'erc20_transfer') && tx.call_detail?.amount) {
    return `${base}: ${tx.call_detail.amount}`
  }
  // 配置变更交易显示具体内容
  const d = tx.call_detail
  const findName = (addr: string, nameField?: string) => {
    if (!addr) return ''
    // 0. 优先使用 call_detail 中后端补充的名字字段
    if (nameField && d?.[nameField]) return d[nameField]
    const lower = addr.toLowerCase()
    // 1. 从当前 owner 列表找
    const o = owners.value.find((o) => o.owner_address?.toLowerCase() === lower)
    if (o?.handle || o?.phone) return o.handle || o.phone
    // 2. 从所有已加载交易的 owner_snapshot 中找（覆盖已被移除的 owner）
    const allTxs = [...queueTxs.value, ...historyTxs.value]
    for (const t of allTxs) {
      const snapshotOwners = t.owner_snapshot
        ? (Array.isArray(t.owner_snapshot) ? t.owner_snapshot : t.owner_snapshot.owners || [])
        : []
      const entry = snapshotOwners.find((e: any) => e.address?.toLowerCase() === lower)
      if (entry?.name) return entry.name
    }
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }
  switch (tx.tx_type) {
    case 'add_owner':
      return `${base}: ${findName(d?.new_owner, 'new_owner_name')} → ${i18n.text['multisig.threshold'] || 'Threshold'} ${d?.new_threshold}`
    case 'remove_owner':
      return `${base}: ${findName(d?.owner, 'owner_name')} → ${i18n.text['multisig.threshold'] || 'Threshold'} ${d?.new_threshold}`
    case 'change_threshold':
      return `${base}: ${tx.threshold_at_creation} → ${d?.new_threshold}`
    case 'replace_owner':
      return `${base}: ${findName(d?.old_owner, 'old_owner_name')} → ${findName(d?.new_owner, 'new_owner_name')}`
  }
  return base
}

function statusClass(status: string): string {
  const classes: Record<string, string> = {
    queued: 'bg-gray-100 text-gray-600',
    signing: 'bg-blue-100 text-blue-600',
    ready: 'bg-green-100 text-green-600',
    executing: 'bg-yellow-100 text-yellow-600',
    executed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-600',
    withdrawn: 'bg-gray-100 text-gray-400',
    superseded: 'bg-gray-100 text-gray-400',
    expired: 'bg-gray-100 text-gray-400',
  }
  return classes[status] || 'bg-gray-100 text-gray-600'
}

function abbr(id: string): string {
  if (!id || id.length < 8) return id
  return `${id.slice(0, 6)}...`
}

function toExplorer(txHash: string) {
  const chain = chainStore.chain
  const url = chain.blockExplorers?.default?.url
  if (url) {
    window.open(`${url}/tx/${txHash}`, '_blank')
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString()
}
</script>
