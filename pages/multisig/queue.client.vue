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
                {{ i18n.text['multisig.proposedBy'] }} {{ tx.proposer?.name || abbr(tx.proposer?.address || String(tx.proposer_id)) }} · {{ timeAgo(tx.created_at) }}
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
      <div v-if="!historyTxs.length" class="text-center text-gray-400 text-sm mt-12">
        {{ i18n.text['multisig.noHistory'] }}
      </div>
      <div
        v-for="tx in historyTxs"
        :key="tx.id"
        class="bg-white rounded-xl border border-gray-100 p-4 cursor-pointer hover:shadow-sm transition-all"
        @click="router.push(`/multisig/${tx.id}`)"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-lg">{{ txIcon(tx) }}</span>
            <div>
              <p class="text-sm font-medium text-gray-800">{{ txLabel(tx) }}</p>
              <p class="text-xs text-gray-400">{{ timeAgo(tx.created_at) }}</p>
            </div>
          </div>
          <span class="text-xs px-2 py-0.5 rounded-full font-medium" :class="statusClass(tx.status)">
            {{ i18n.text['multisig.status.' + tx.status] || tx.status }}
          </span>
        </div>
        <div v-if="tx.tx_hash" class="mt-2 flex justify-end">
          <button
            class="text-xs text-primary-500 hover:text-primary-700 transition-colors"
            @click.stop="toExplorer(tx.tx_hash)"
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

    <!-- Passcode modal for execute -->
    <PasscodeModal
      v-if="showPasscode"
      @confirm="onExecutePasscode"
      @cancel="showPasscode = false"
    />
  </div>
</template>

<script setup lang="ts">
import { useMultisigStore } from '~/stores/multisig'
import { useUserStore } from '~/stores/user'
import { useChainStore } from '~/stores/chain'
import { useI18n } from '~/stores/i18n'
import { getMultisigWalletOwners, getMultisigTxs, executeMultisigTx, confirmMultisigTx, failMultisigTx, syncMultisigWallet } from '~/utils/multisig_api'
import { executeMultisigUserOp, getSafeOwnersAndThreshold } from '~/utils/SafeSmartAccount/multisig'
import { keystoreToPrivateKey } from '~/utils/encryption'
import { chainMap } from '~/stores/chain'
import type { MultisigTx, MultisigOwner } from '~/utils/multisig_api'
import { getBalance, getPopularERC20Balance, type ERC20Balance } from '~/utils/balance'
import { displayBalance } from '~/utils/display'
import { getTokenClass } from '~/utils/semi_api'

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
const owners = ref<MultisigOwner[]>([])
const ownerCount = ref(0)
const showPasscode = ref(false)
const executing = ref(false)
let executingTx: MultisigTx | null = null

const activeWallet = computed(() => multisigStore.activeWallet)
const currentUserAddress = computed(() => userStore.user?.evm_chain_active_key?.toLowerCase() || '')

// Balances
const ethBalance = ref<bigint>(0n)
const tokenBalances = ref<ERC20Balance[]>([])

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
    const { txs } = await getMultisigTxs(activeWallet.value.id, 'history')
    historyTxs.value = txs
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
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
  showPasscode.value = true
}

async function onExecutePasscode(passcode: string) {
  showPasscode.value = false
  if (!executingTx) return
  const tx = executingTx
  executing.value = true

  try {
    const { tx: lockedTx } = await executeMultisigTx(tx.id)
    if (!lockedTx.user_op_snapshot || !lockedTx.signatures) throw new Error('Missing snapshot or signatures')

    const encryptedKeys = userStore.user?.encrypted_keys
    if (!encryptedKeys) throw new Error('No encrypted keys')
    const keystore = typeof encryptedKeys === 'string' ? JSON.parse(encryptedKeys) : encryptedKeys
    await keystoreToPrivateKey(keystore, passcode) // validate passcode

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

    const { txHash } = await executeMultisigUserOp(
      lockedTx.user_op_snapshot,
      eligibleSignatures,
      execThreshold,
      chain
    )

    await confirmMultisigTx({ multisig_tx_id: tx.id, tx_hash: txHash })
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
    toast.add({ title: i18n.text['Transfer Success'] || 'Success', description: txHash, color: 'success' })
    await fetchQueue()
  } catch (err: any) {
    await failMultisigTx(tx.id).catch(() => {})
    toast.add({ title: i18n.text['Error'] || 'Error', description: err.message, color: 'error' })
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
</script>
