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
    <div v-if="loading" class="space-y-4 w-[80%] mx-auto">
      <div class="h-20 rounded-xl loading-bg" />
      <div class="h-40 rounded-xl loading-bg" />
      <div class="h-32 rounded-xl loading-bg" />
    </div>

    <template v-else-if="tx">
      <!-- Status banner -->
      <div class="px-4 py-3 text-sm font-semibold text-center" :class="bannerClass">
        {{ i18n.text['multisig.status.' + tx.status] || tx.status }}
      </div>

      <div class="space-y-4 w-[80%] mx-auto pb-32">
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
            {{ i18n.text['multisig.notCurrentOwner'] || '你已不是该钱包当前签名者，无法签名此交易' }}
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
import { keystoreToPrivateKey } from '~/utils/encryption'
import { chainMap } from '~/stores/chain'
import { uploadTransaction } from '~/utils/semi_api'

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
let passcodeAction: 'sign' | 'execute' = 'sign'

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
  await loadTx()
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
  } else {
    await doExecute(passcode)
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
    const encryptedKeys = userStore.user?.encrypted_keys
    if (!encryptedKeys) throw new Error('No encrypted keys')
    const keystore = typeof encryptedKeys === 'string' ? JSON.parse(encryptedKeys) : encryptedKeys
    const privateKey = await keystoreToPrivateKey(keystore, passcode) as `0x${string}`

    let snapshot = tx.value.user_op_snapshot
    let nonce: string | undefined

    // First signer: need to build snapshot
    if (!snapshot) {
      const activeWallet = multisigStore.activeWallet
      if (!activeWallet) throw new Error('No active wallet')
      const chain = chainMap[tx.value.chain_id]
      if (!chain) throw new Error('Unsupported chain')

      const ownerAddresses = owners.value.map((o) => o.owner_address)
      const calls = buildCallsFromTx(tx.value)

      snapshot = await buildMultisigUserOpSnapshot({
        safeAddress: activeWallet.safe_address,
        owners: ownerAddresses,
        threshold: effectiveThreshold.value,
        chain,
        calls,
      })
      nonce = snapshot.nonce
    }

    const { signer, signature } = await signSafeOpSnapshot(privateKey, snapshot)

    await submitMultisigSignature({
      multisig_tx_id: tx.value.id,
      signer_address: signer,
      signature,
      nonce,
      user_op_snapshot: nonce ? snapshot : undefined,
    })

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
    // 1. 先验证支付码是否正确（不锁定后端状态）
    const encryptedKeys = userStore.user?.encrypted_keys
    if (!encryptedKeys) throw new Error('No encrypted keys')
    const keystore = typeof encryptedKeys === 'string' ? JSON.parse(encryptedKeys) : encryptedKeys
    const privateKey = await keystoreToPrivateKey(keystore, passcode) as `0x${string}`

    // 2. 支付码正确，锁定后端状态
    const { tx: lockedTx } = await executeMultisigTx(tx.value.id)
    if (!lockedTx.user_op_snapshot || !lockedTx.signatures) throw new Error('Missing snapshot/signatures')

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

    await confirmMultisigTx({ multisig_tx_id: tx.value.id, tx_hash: txHash })

    // 与单签一致：执行成功后上传交易记录到常规交易表，使收款方能查到备注
    try {
      const safeAddress = multisigStore.activeWallet?.safe_address || ''
      console.log('[doExecute] Uploading transaction with memo:', tx.value.memo, 'sender_note:', tx.value.sender_note, 'tx_hash:', txHash)
      await uploadTransaction({
        tx_hash: txHash,
        gas_used: '0',
        status: 'success',
        chain: chain.name.toLowerCase(),
        data: '',
        memo: tx.value.memo || '',
        sender_note: tx.value.sender_note || '',
        sender_address: safeAddress,
        receiver_address: tx.value.call_detail?.to || '',
      })
      console.log('[doExecute] Upload transaction success')
    } catch (e) {
      console.error('[doExecute] Upload transaction failed:', e)
    }

    await handlePostOwnerConfigConfirm(tx.value.tx_type, tx.value.call_detail)
    showPasscode.value = false
    toast.add({ title: i18n.text['Transfer Success'] || 'Executed!', color: 'success' })
    await loadTx()
  } catch (err: any) {
    if (isWrongPasscodeError(err)) {
      passcodeError.value = i18n.text['multisig.wrongPasscode'] || '支付码错误，请重新输入'
      // 密码错误时后端状态不会被锁定，无需重置
    } else {
      showPasscode.value = false
      // 只有后端已锁定状态才标记失败
      if (tx.value?.status === 'executing') {
        await failMultisigTx(tx.value.id).catch(() => {})
      }
      toast.add({ title: i18n.text['Error'] || 'Error', description: err.message, color: 'error' })
      await loadTx()
    }
  } finally {
    executing.value = false
  }
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
    const activeWallet = multisigStore.activeWallet
    if (!activeWallet) throw new Error('No active wallet')
    const chain = chainMap[tx.value.chain_id]
    if (!chain) throw new Error('Unsupported chain')
    if (!tx.value.nonce) throw new Error('Target transaction has no locked nonce')

    const ownerAddresses = owners.value.map((o) => o.owner_address)
    const safeAddress = activeWallet.safe_address as `0x${string}`

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
    const activeWallet = multisigStore.activeWallet
    if (!activeWallet) throw new Error('No active wallet')
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

async function handlePostOwnerConfigConfirm(txType: string, callDetail?: Record<string, any>) {
  if (!['add_owner', 'remove_owner', 'change_threshold', 'replace_owner'].includes(txType)) return

  const walletId = multisigStore.activeWalletId

  // 配置类交易执行后，直接以链上真实 owner/threshold 刷新后端 DB 镜像，
  // 保证首页/队列里后续交易展示的门限与签名资格立即与链上一致。
  if (tx.value) {
    try {
      const chain = chainMap[tx.value.chain_id]
      const safeAddress = multisigStore.activeWallet?.safe_address
      if (chain && safeAddress) {
        const { owners: chainOwners, threshold: chainThreshold } =
          await getSafeOwnersAndThreshold(safeAddress as `0x${string}`, chain)
        await syncMultisigWallet({
          wallet_id: tx.value.wallet_id,
          owners: chainOwners,
          threshold: chainThreshold,
        })
      }
    } catch {
      // 链上读取失败不阻断主流程；后端 apply_wallet_config 已基于 call_detail 更新镜像，
      // 用户仍可手动点击「从链上同步」兜底。
    }
  }

  await multisigStore.fetchWallets()

  const removedAddr = callDetail?.owner?.toLowerCase?.()
  if (
    txType === 'remove_owner' &&
    removedAddr &&
    removedAddr === currentUserAddress.value
  ) {
    multisigStore.setActiveWallet(null)
    toast.add({
      title: i18n.text['multisig.removedFromWallet'] || 'Removed from wallet',
      color: 'warning',
    })
    router.push('/')
    return
  }

  if (walletId && !multisigStore.wallets.some((w) => w.id === walletId)) {
    multisigStore.setActiveWallet(null)
    router.push('/')
  }
}

function buildCallsFromTx(t: MultisigTx): { to: `0x${string}`; value?: bigint; data?: `0x${string}` }[] {
  if (t.tx_type === 'cancel') {
    const safe = multisigStore.activeWallet?.safe_address as `0x${string}` | undefined
    if (!safe) return []
    return [{ to: safe, value: 0n, data: '0x' }]
  }

  let calls: { to: `0x${string}`; value?: bigint; data?: `0x${string}` }[] = []

  if (t.tx_type === 'transfer' && t.call_detail.to) {
    const ethAmount = t.call_detail.amount || '0'
    const weiValue = BigInt(Math.round(parseFloat(ethAmount) * 1e18))
    calls = [{ to: t.call_detail.to as `0x${string}`, value: weiValue }]
  } else if (t.evm_call_data) {
    const activeWallet = multisigStore.activeWallet
    calls = [{ to: activeWallet?.safe_address as `0x${string}`, data: t.evm_call_data as `0x${string}`, value: 0n }]
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
