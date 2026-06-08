<template>
  <div class="relative" ref="containerRef">
    <!-- Gear icon with optional badge -->
    <div class="relative cursor-pointer" @click="toggleMenu">
      <UIcon name="ci:settings" size="24" class="hover:text-primary-500" />
      <span
        v-if="badgeCount > 0"
        class="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-orange-500 text-white text-[9px] font-bold flex items-center justify-center"
      >
        {{ badgeCount }}
      </span>
    </div>

    <!-- Dropdown -->
    <Transition
      enter-active-class="transition duration-100 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-75 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="menuOpen"
        class="absolute right-0 top-8 w-72 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden"
      >
        <!-- My Wallets header -->
        <div class="px-4 pt-3 pb-1">
          <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {{ i18n.text['multisig.myWallets'] }}
          </p>
        </div>

        <!-- Personal wallet -->
        <button
          class="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors"
          @click="switchToPersonalWallet"
        >
          <div class="flex items-center gap-2.5">
            <span class="text-base">👤</span>
            <div class="text-left">
              <p class="text-sm font-medium text-gray-800">{{ personalWalletName }}</p>
              <CopyableAddress :address="personalWalletAddress" text-class="text-xs text-gray-400" />
            </div>
          </div>
          <span v-if="!activeMultisigId" class="text-primary-500 text-xs font-semibold">✓</span>
        </button>

        <!-- Divider -->
        <div v-if="multisigWallets.length" class="border-t border-gray-100 mx-3" />

        <!-- Multisig wallets -->
        <button
          v-for="wallet in multisigWallets"
          :key="wallet.id"
          class="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors"
          @click="switchToMultisigWallet(wallet)"
        >
          <div class="flex items-center gap-2.5">
            <span class="text-base">👥</span>
            <div class="text-left">
              <p class="text-sm font-medium text-gray-800">{{ wallet.name }}</p>
              <CopyableAddress :address="wallet.safe_address" text-class="text-xs text-gray-400" />
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span
              v-if="multisigBadge(wallet.id) > 0"
              class="w-5 h-5 rounded-full bg-orange-500 text-white text-[9px] font-bold flex items-center justify-center"
            >
              {{ multisigBadge(wallet.id) }}
            </span>
            <span v-if="activeMultisigId === wallet.id" class="text-primary-500 text-xs font-semibold">✓</span>
          </div>
        </button>

        <!-- Create multisig wallet -->
        <div class="border-t border-gray-100 mx-3" />
        <button
          class="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 transition-colors"
          @click="goCreateMultisig"
        >
          <span class="text-base">➕</span>
          <span class="text-sm font-medium text-gray-700">{{ i18n.text['multisig.createTeamWallet'] }}</span>
        </button>

        <!-- Divider -->
        <div class="border-t border-gray-100 mx-3" />

        <!-- Export -->
        <button
          class="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 transition-colors"
          @click="handleExportKeyStore"
        >
          <UIcon name="ci:download" size="16" class="text-gray-500" />
          <span class="text-sm text-gray-700">{{ i18n.text['Export Wallet'] }}</span>
        </button>

        <!-- Logout -->
        <button
          class="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 transition-colors"
          @click="handleLogout"
        >
          <UIcon name="ci:log-out" size="16" class="text-gray-500" />
          <span class="text-sm text-gray-700">{{ i18n.text['Logout'] }}</span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { useUserStore } from "~/stores/user";
import { useMultisigStore } from "~/stores/multisig";
import { useRouter, useRoute } from "vue-router";
import { useI18n } from "~/stores/i18n";

const userStore = useUserStore();
const multisigStore = useMultisigStore();
const toast = useToast();
const router = useRouter();
const route = useRoute();
const i18n = useI18n();

const menuOpen = ref(false);
const containerRef = ref<HTMLElement | null>(null);

// ─── State ────────────────────────────────────────────────────────────────────

const personalWalletName = computed(() => userStore.user?.handle || userStore.user?.name || i18n.text['multisig.personalWallet'] || 'Personal Wallet')
const personalWalletAddress = computed(() => userStore.user?.evm_chain_address || '')
const multisigWallets = computed(() => multisigStore.wallets)
const activeMultisigId = computed(() => multisigStore.activeWalletId)

const badgeCount = computed(() => {
  return multisigWallets.value.reduce((sum, w) => {
    return sum + multisigBadge(w.id)
  }, 0)
})

function multisigBadge(walletId: string): number {
  // Use server-provided pending counts for all wallets
  const count = multisigStore.pendingSignatureCounts[walletId]
  if (count !== undefined) return count
  // Fallback to store's queue txs for active wallet
  if (walletId !== multisigStore.activeWalletId) return 0
  return multisigStore.pendingSignatureCount
}

// ─── Actions ──────────────────────────────────────────────────────────────────

function toggleMenu() {
  if (!menuOpen.value) {
    multisigStore.fetchWallets()
  }
  menuOpen.value = !menuOpen.value
}

function abbr(address: string): string {
  if (!address || address.length < 10) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function switchToPersonalWallet() {
  if (route.path === '/transfer') {
    const confirmed = window.confirm(i18n.text['multisig.switchWalletConfirm'] || 'Switch wallet? Unsaved content will be lost.')
    if (!confirmed) return
  }
  multisigStore.setActiveWallet(null)
  menuOpen.value = false
  router.push('/')
}

async function switchToMultisigWallet(wallet: any) {
  if (route.path === '/transfer') {
    const confirmed = window.confirm(i18n.text['multisig.switchWalletConfirm'] || 'Switch wallet? Unsaved content will be lost.')
    if (!confirmed) return
  }
  multisigStore.setActiveWallet(wallet.id)
  menuOpen.value = false
  // Fetch queue for badge update
  await multisigStore.fetchQueue(wallet.id)
  multisigStore.updateBadge(personalWalletAddress.value)
  router.push('/multisig/queue')
}

function goCreateMultisig() {
  menuOpen.value = false
  router.push('/multisig/create')
}

const handleExportKeyStore = () => {
  menuOpen.value = false
  router.push('/export')
}

const handleLogout = async () => {
  menuOpen.value = false
  try {
    await userStore.signout()
    toast.add({
      title: i18n.text['Logout Success'],
      description: i18n.text['You have successfully logged out'],
      color: 'success',
    })
  } catch (error) {
    toast.add({
      title: i18n.text['Logout Failed'],
      description: i18n.text['Please try again later'],
      color: 'error',
    })
  }
}

// Close menu on outside click
onMounted(() => {
  document.addEventListener('click', handleOutsideClick)
})
onUnmounted(() => {
  document.removeEventListener('click', handleOutsideClick)
})

function handleOutsideClick(e: MouseEvent) {
  if (containerRef.value && !containerRef.value.contains(e.target as Node)) {
    menuOpen.value = false
  }
}
</script>
