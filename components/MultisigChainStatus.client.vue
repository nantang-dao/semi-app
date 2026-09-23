<template>
  <!-- 紧凑：钱包列表里只显示已激活链的小图标 -->
  <div v-if="compact" class="flex items-center gap-1 mt-0.5">
    <template v-for="c in enabledChains" :key="c.id">
      <img
        v-if="c.activated"
        :src="c.icon"
        :title="`${c.name} ${i18n.text['multisig.activated'] || '已激活'}`"
        alt=""
        class="w-3.5 h-3.5"
      />
    </template>
    <span v-if="loaded && !enabledChains.some((c) => c.activated)" class="text-[10px] text-gray-400">
      {{ i18n.text['multisig.notActivatedAnywhere'] || '尚未在任何链上激活' }}
    </span>
  </div>

  <!-- 完整：多签首页 -->
  <div v-else class="space-y-2">
    <div class="flex flex-wrap items-center gap-2">
      <button
        v-for="c in enabledChains"
        :key="c.id"
        type="button"
        class="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors"
        :class="[
          c.id === currentChainId ? 'border-primary-400 bg-primary-50' : 'border-gray-200 bg-white hover:bg-gray-50',
        ]"
        :title="c.activated
          ? (i18n.text['multisig.activatedHint'] || '合约已部署')
          : (i18n.text['multisig.notActivatedHint'] || '合约未部署，第一笔交易执行后自动激活；地址已可收款')"
        @click="switchTo(c.id)"
      >
        <img :src="c.icon" alt="" class="w-4 h-4" :class="c.activated === false ? 'grayscale opacity-60' : ''" />
        <span :class="c.id === currentChainId ? 'font-semibold text-gray-800' : 'text-gray-600'">{{ c.name }}</span>
        <span v-if="c.activated === null" class="text-gray-300">…</span>
        <span v-else-if="c.activated" class="flex items-center gap-1 text-green-600">
          <span class="w-1.5 h-1.5 rounded-full bg-green-500" />{{ i18n.text['multisig.activated'] || '已激活' }}
        </span>
        <span v-else class="text-gray-400">{{ i18n.text['multisig.notActivated'] || '未激活' }}</span>
      </button>

      <!-- 未启用的链：任一成员可手动启用 -->
      <button
        v-for="c in disabledChains"
        :key="c.id"
        type="button"
        class="flex items-center gap-1.5 rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-xs text-gray-400 hover:border-primary-300 hover:text-primary-500 transition-colors"
        :disabled="enabling !== null"
        @click="confirming = c.id"
      >
        <img :src="c.icon" alt="" class="w-4 h-4 grayscale opacity-50" />
        <span>{{ c.name }}</span>
        <span>+ {{ i18n.text['multisig.enableChain'] || '启用' }}</span>
      </button>
    </div>

    <!-- 启用确认 -->
    <div v-if="confirmingChain" class="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 space-y-2">
      <p>
        {{ (i18n.text['multisig.enableChainConfirm'] || '在 {chain} 上启用这个数字身份？地址不变，成员和门槛与创建时相同；第一笔交易执行时自动激活。')
          .replace('{chain}', confirmingChain.name) }}
      </p>
      <p v-if="!confirmingChain.sponsored" class="text-amber-600">
        {{ (i18n.text['multisig.enableChainUnsponsored'] || '{chain} 不代付 gas，交易手续费（含首笔的激活费用）由数字身份自己的 ETH 支付。')
          .replace('{chain}', confirmingChain.name) }}
      </p>
      <p class="text-gray-400">
        {{ i18n.text['multisig.enableChainRule'] || '成员或门槛变更过后，就不能再启用新网络。' }}
      </p>
      <div class="flex justify-end gap-2">
        <UButton size="xs" color="neutral" variant="ghost" :disabled="enabling !== null" @click="confirming = null">
          {{ i18n.text['Cancel'] || '取消' }}
        </UButton>
        <UButton size="xs" :loading="enabling === confirmingChain.id" @click="enable(confirmingChain.id)">
          {{ i18n.text['multisig.enableChain'] || '启用' }}
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { chainMap, useChainStore } from '~/stores/chain'
import { useMultisigStore } from '~/stores/multisig'
import { useI18n } from '~/stores/i18n'
import {
  chainName,
  enableMultisigChain,
  isSafeActivated,
  multisigChainIdsFor,
  walletRowsOf,
} from '~/utils/multisig_chains'
import { isGasSponsorshipChain } from '~/utils/gas_sponsorship'
import type { MultisigWallet } from '~/utils/multisig_api'

const props = defineProps<{
  wallet: MultisigWallet
  compact?: boolean
  /** 变化时强制重新读链上状态（例如执行完交易后） */
  refreshKey?: number
}>()

const i18n = useI18n()
const toast = useToast()
const chainStore = useChainStore()
const multisigStore = useMultisigStore()

const currentChainId = computed(() => chainStore.chain.id)
const status = ref<Record<number, boolean | null>>({})
const loaded = ref(false)
const confirming = ref<number | null>(null)
const enabling = ref<number | null>(null)

/** 已启用 = 当前用户在这条链上有这个钱包的行 */
const enabledIds = computed(() => new Set(walletRowsOf(props.wallet, multisigStore.wallets).map((w) => w.chain_id)))

const chains = computed(() =>
  multisigChainIdsFor(props.wallet.chain_id).map((id) => ({
    id,
    name: chainMap[id]?.name ?? String(id),
    icon: chainMap[id]?.icon ?? '',
    enabled: enabledIds.value.has(id),
    sponsored: isGasSponsorshipChain(id),
    activated: status.value[id] ?? null,
  }))
)
const enabledChains = computed(() => chains.value.filter((c) => c.enabled))
const disabledChains = computed(() => chains.value.filter((c) => !c.enabled))
const confirmingChain = computed(() => disabledChains.value.find((c) => c.id === confirming.value) ?? null)

async function load(fresh = false) {
  await Promise.all(
    [...enabledIds.value].map(async (id) => {
      try {
        status.value = { ...status.value, [id]: await isSafeActivated(props.wallet.safe_address, id, fresh) }
      } catch {
        // 读不到就保持未知，不误报「未激活」
      }
    })
  )
  loaded.value = true
}

watch(() => props.wallet.safe_address, () => { status.value = {}; loaded.value = false; confirming.value = null; load() }, { immediate: true })
watch(() => props.refreshKey, () => load(true))
watch(() => [...enabledIds.value].join(','), () => load())

async function switchTo(chainId: number) {
  if (chainId === currentChainId.value) return
  await chainStore.switch(chainId)
  multisigStore.alignActiveWalletToChain(chainId)
}

async function enable(chainId: number) {
  enabling.value = chainId
  try {
    await enableMultisigChain(props.wallet, multisigStore.wallets, chainId)
    await multisigStore.fetchWallets()
    confirming.value = null
    toast.add({
      title: (i18n.text['multisig.chainEnabled'] || '已在 {chain} 上启用').replace('{chain}', chainName(chainId)),
      color: 'success',
    })
    await switchTo(chainId)
  } catch (e: any) {
    toast.add({
      title: i18n.text['multisig.enableChainFailed'] || '启用失败',
      description: e?.message,
      color: 'error',
    })
  } finally {
    enabling.value = null
  }
}
</script>
