<template>
  <!-- 紧凑：钱包列表里只显示已激活链的小图标 -->
  <div v-if="compact" class="flex items-center gap-1 mt-0.5">
    <template v-for="c in chains" :key="c.id">
      <img
        v-if="c.activated"
        :src="c.icon"
        :title="`${c.name} ${i18n.text['multisig.activated'] || '已激活'}`"
        alt=""
        class="w-3.5 h-3.5"
      />
    </template>
    <span v-if="loaded && !chains.some((c) => c.activated)" class="text-[10px] text-gray-400">
      {{ i18n.text['multisig.notActivatedAnywhere'] || '尚未在任何链上激活' }}
    </span>
  </div>

  <!-- 完整：多签首页 -->
  <div v-else class="flex flex-wrap items-center gap-2">
    <button
      v-for="c in chains"
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
  </div>
</template>

<script setup lang="ts">
import { chainMap, useChainStore } from '~/stores/chain'
import { useMultisigStore } from '~/stores/multisig'
import { useI18n } from '~/stores/i18n'
import { isSafeActivated, multisigChainIdsFor, walletRowsOf } from '~/utils/multisig_chains'
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

const chains = computed(() =>
  multisigChainIdsFor(props.wallet.chain_id).map((id) => ({
    id,
    name: chainMap[id]?.name ?? String(id),
    icon: chainMap[id]?.icon ?? '',
    activated: status.value[id] ?? null,
  }))
)

async function load(fresh = false) {
  const ids = multisigChainIdsFor(props.wallet.chain_id)
  await Promise.all(
    ids.map(async (id) => {
      try {
        status.value = { ...status.value, [id]: await isSafeActivated(props.wallet.safe_address, id, fresh) }
      } catch {
        // 读不到就保持未知，不误报「未激活」
      }
    })
  )
  loaded.value = true
}

watch(() => props.wallet.safe_address, () => { status.value = {}; loaded.value = false; load() }, { immediate: true })
watch(() => props.refreshKey, () => load(true))

async function switchTo(chainId: number) {
  if (chainId === currentChainId.value) return
  const hasRow = walletRowsOf(props.wallet, multisigStore.wallets).some((w) => w.chain_id === chainId)
  if (!hasRow) {
    toast.add({
      title: i18n.text['multisig.notOwnerOnChain'] || '你在这条链上不是该数字身份的签名者',
      color: 'warning',
    })
    return
  }
  await chainStore.switch(chainId)
  multisigStore.alignActiveWalletToChain(chainId)
}
</script>
