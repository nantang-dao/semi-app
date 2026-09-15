import { defineStore } from "pinia";
import {
  getMultisigWallets,
  getMultisigTxs,
  type MultisigWallet,
  type MultisigTx,
} from "~/utils/multisig_api";
import { addMissingChainRows } from "~/utils/multisig_chains";

interface MultisigState {
  wallets: MultisigWallet[];
  activeWalletId: string | null;
  queueTxs: MultisigTx[];
  loading: boolean;
  /** Pending-signature badge count for the active wallet (0 or 1 per UI spec) */
  pendingSignatureCount: number;
  /** Pending-signature counts for all wallets, keyed by wallet ID */
  pendingSignatureCounts: Record<string, number>;
}

export const useMultisigStore = defineStore("multisig", {
  state: (): MultisigState => ({
    wallets: [],
    activeWalletId: null,
    queueTxs: [],
    loading: false,
    pendingSignatureCount: 0,
    pendingSignatureCounts: {},
  }),

  getters: {
    activeWallet(state): MultisigWallet | null {
      return state.wallets.find((w) => w.id === state.activeWalletId) ?? null;
    },

    /** 某条链上的钱包行。同一 Safe 在每条链上各一行，列表只显示当前网络的。 */
    walletsOnChain:
      (state) =>
      (chainId: number): MultisigWallet[] =>
        state.wallets.filter((w) => w.chain_id === chainId),

    /** Badge count keyed by wallet ID: 0 or 1 */
    walletBadge:
      (state) =>
      (walletId: string, currentUserAddress: string): number => {
        if (!currentUserAddress) return 0;
        const addr = currentUserAddress.toLowerCase();
        const queue = walletId === state.activeWalletId ? state.queueTxs : [];
        const frontTx = queue.find((tx) => tx.queue_position === Math.min(...queue.map((t) => t.queue_position ?? Infinity)));
        if (!frontTx) return 0;
        if (frontTx.status !== "signing" && frontTx.status !== "queued") return 0;
        const hasSigned = frontTx.signatures?.some(
          (s) => s.signer_address.toLowerCase() === addr
        );
        return hasSigned ? 0 : 1;
      },
  },

  actions: {
    async fetchWallets() {
      try {
        this.loading = true;
        let { wallets, pending_signature_counts } = await getMultisigWallets();
        // 老钱包只有创建时那条链的行，补齐同组其他链后重新拉一次
        if (await addMissingChainRows(wallets)) {
          ({ wallets, pending_signature_counts } = await getMultisigWallets());
        }
        this.wallets = wallets;
        if (pending_signature_counts) {
          this.pendingSignatureCounts = pending_signature_counts;
        }
      } catch (e) {
        console.error("[MultisigStore] fetchWallets error:", e);
      } finally {
        this.loading = false;
      }
    },

    /**
     * 切换网络后，把当前多签钱包换成同一 Safe 在新链上的那一行；
     * 当前用户在新链上不是 owner（没有这一行）时退回个人钱包。
     */
    alignActiveWalletToChain(chainId: number) {
      const current = this.activeWallet;
      if (!current || current.chain_id === chainId) return;
      const sibling = this.wallets.find(
        (w) => w.chain_id === chainId && w.safe_address.toLowerCase() === current.safe_address.toLowerCase()
      );
      this.setActiveWallet(sibling?.id ?? null);
    },

    setActiveWallet(walletId: string | null) {
      this.activeWalletId = walletId;
      this.queueTxs = [];
      this.pendingSignatureCount = 0;
    },

    async fetchQueue(walletId?: string) {
      const id = walletId ?? this.activeWalletId;
      if (!id) return;
      try {
        const { txs } = await getMultisigTxs(id, "queue");
        this.queueTxs = txs;
      } catch (e) {
        console.error("[MultisigStore] fetchQueue error:", e);
      }
    },

    /** Update badge count for the active wallet after fetching queue */
    updateBadge(currentUserAddress: string) {
      if (!currentUserAddress) {
        this.pendingSignatureCount = 0;
        return;
      }
      const addr = currentUserAddress.toLowerCase();
      const positions = this.queueTxs
        .map((t) => t.queue_position)
        .filter((p): p is number => p !== null);
      if (!positions.length) {
        this.pendingSignatureCount = 0;
        return;
      }
      const minPos = Math.min(...positions);
      const frontTx = this.queueTxs.find((t) => t.queue_position === minPos);
      if (!frontTx || !["queued", "signing"].includes(frontTx.status)) {
        this.pendingSignatureCount = 0;
        return;
      }
      const hasSigned = frontTx.signatures?.some(
        (s) => s.signer_address.toLowerCase() === addr
      );
      this.pendingSignatureCount = hasSigned ? 0 : 1;
    },
  },
});
