<template>
  <div class="space-y-3">
    <!-- Progress bar -->
    <div class="flex items-center gap-2">
      <div class="flex gap-1 flex-1">
        <div
          v-for="i in threshold"
          :key="i"
          class="h-2 flex-1 rounded-full"
          :class="i <= signedCount ? 'bg-green-500' : 'bg-gray-200'"
        />
      </div>
      <span class="text-sm font-bold text-gray-700 whitespace-nowrap">
        {{ signedCount }}/{{ threshold }} {{ i18n.text['multisig.signed'] }}
      </span>
    </div>

    <!-- 历史提案门限（仅活跃交易且与当前门限不一致时展示） -->
    <p
      v-if="showProposalThreshold"
      class="text-xs text-gray-400 -mt-1"
    >
      {{ (i18n.text['multisig.proposalThresholdNote'] || '提案阈值：{n}（仅历史参考，以当前阈值为准）').replace('{n}', String(proposalThreshold)) }}
    </p>

    <!-- Signer list -->
    <div v-if="showList" class="space-y-2">
      <!-- 快照模式（终态交易）：使用 owner_snapshot 展示完整 owner 列表及签名状态 -->
      <template v-if="snapshotEntries.length > 0">
        <div
          v-for="entry in snapshotEntries"
          :key="entry.address"
          class="flex items-center justify-between py-1.5"
        >
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-500">
              👤
            </div>
            <div>
              <template v-if="entry.name">
                <p class="text-sm font-medium text-gray-800">{{ entry.name }}</p>
                <CopyableAddress :address="entry.address" text-class="text-xs text-gray-400" />
              </template>
              <CopyableAddress v-else :address="entry.address" text-class="text-sm font-medium text-gray-800" />
            </div>
          </div>
          <div>
            <span v-if="entry.signed" class="text-green-500 text-lg">✅</span>
            <span v-else class="text-gray-300 text-lg">⬜</span>
          </div>
        </div>
      </template>
      <!-- 实时模式（活跃交易）：遍历当前 owner 列表 -->
      <template v-else>
        <div
          v-for="owner in owners"
          :key="owner.owner_address"
          class="flex items-center justify-between py-1.5"
        >
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-500">
              👤
            </div>
            <div>
              <p class="text-sm font-medium text-gray-800">
                {{ owner.handle || owner.phone || '' }}
              </p>
              <CopyableAddress :address="owner.owner_address" text-class="text-xs text-gray-400" />
            </div>
          </div>
          <div>
            <span v-if="hasSigned(owner.owner_address)" class="text-green-500 text-lg">✅</span>
            <span v-else class="text-gray-300 text-lg">⬜</span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MultisigOwner, MultisigSignatureData, OwnerSnapshot, OwnerSnapshotEntry } from '~/utils/multisig_api'
import { useI18n } from '~/stores/i18n'

const i18n = useI18n()

const props = defineProps<{
  owners: MultisigOwner[]
  signatures: MultisigSignatureData[]
  /** 当前生效门限 */
  threshold: number
  showList?: boolean
  /** 签名数（建议传 eligible_signature_count） */
  signedCount?: number
  /** 提案时门限，仅活跃交易且与当前门限不同时展示 */
  proposalThreshold?: number
  /** 终态交易的 owner 快照：含完整 owner 列表及签名状态 */
  ownerSnapshot?: OwnerSnapshot | null
}>()

const snapshotEntries = computed<OwnerSnapshotEntry[]>(() => {
  if (!props.ownerSnapshot) return []
  // 兼容旧格式（纯数组）和新格式（{ owners, proposer }）
  if (Array.isArray(props.ownerSnapshot)) return props.ownerSnapshot
  return props.ownerSnapshot.owners || []
})

const signedCount = computed(() => props.signedCount ?? props.signatures.length)

const showProposalThreshold = computed(
  () => props.proposalThreshold != null && props.proposalThreshold !== props.threshold
)

function hasSigned(address: string): boolean {
  return props.signatures.some(
    (s) => s.signer_address.toLowerCase() === address.toLowerCase()
  )
}

function abbr(address: string): string {
  if (!address || address.length < 10) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}
</script>
