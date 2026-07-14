<template>
    <div class="flex flex-col container-size h-[100vh] rounded-xl bg-[var(--ui-bg)] shadow-lg px-4 sm:px-8 py-8 banner overflow-hidden">
        <UButton icon="i-heroicons-arrow-left" color="neutral" variant="ghost" class="self-start mb-4 shrink-0"
            @click="router.push('/')">
            {{ i18n.text["Back"] }}
        </UButton>

        <div class="flex items-center justify-between mb-4 shrink-0">
            <h1 class="text-2xl font-bold">{{ i18n.text["Activity Records"] }}</h1>
            <UButton icon="i-ci-external-link" color="primary" variant="ghost" @click="toSafeExplorer">
                {{ i18n.text["Block Explorer"] }}
            </UButton>
        </div>

        <!-- 加载动画 -->
        <div class="flex flex-col gap-4" v-if="loading">
            <div class="w-full h-10 rounded-lg loading-bg"></div>
            <div class="w-80 h-10 rounded-lg loading-bg"></div>
            <div class="w-full h-10 rounded-lg loading-bg"></div>
            <div class="w-80 h-10 rounded-lg loading-bg"></div>
            <div class="w-full h-10 rounded-lg loading-bg"></div>
        </div>

        <!-- 活动记录列表 -->
        <UTabs :items="tabs" class="w-full flex-1 min-h-0 flex flex-col" v-else>
            <template #send="{ item }">
                <div ref="sendListRef" class="flex flex-col flex-1 min-h-0 overflow-y-auto">
                    <div class="text-gray-400 text-sm" v-if="sendActions.length === 0">
                        {{ i18n.text["No data available"] }}
                    </div>

                    <div class="flex flex-col gap-2 hover:bg-muted p-2 cursor-pointer border-b border-muted pb-2"
                        v-for="action in sendActions" :key="action.txHex" @click="toExplorer(action.txHex)">
                        <div class="flex gap-2 w-full justify-between">
                            <div class="flex flex-row gap-2 justify-between items-center">
                                <div class="flex flex-col">
                                    <div class="font-medium">
                                        <span class="text-red-400 text-sm">{{ i18n.text["TO"] }}: </span>
                                        <span v-if="action.receiverHandle">{{ action.receiverHandle }} ({{ formatAddress(action.to) }})</span>
                                        <span v-else>{{ formatAddress(action.to) }}</span>
                                    </div>
                                    <div class="text-gray-400 text-sm flex flex-row gap-1 items-center"
                                        v-if="action.token === 'NATIVE_COIN'">
                                        <div>
                                            {{ displayBalance(action.value, 6, 18) }}
                                            {{ useChain.chain.nativeCurrency.symbol }}
                                        </div>
                                    </div>
                                    <div class="text-gray-400 text-sm" v-else>
                                        {{ displayBalance(action.value, 6, action.decimals) }}
                                        {{ action.symbol }}
                                    </div>
                                </div>
                            </div>

                            <div class="flex flex-col gap-2 items-end">
                                <div class="text-gray-400 text-sm">
                                    {{ displayDate(action.date) }}
                                </div>
                                <div class="text-gray-400 text-sm">{{ action.status }}</div>
                            </div>
                        </div>

                        <div class="flex flex-row gap-1 items-center text-sm" v-if="action.memo">
                            <UIcon name="ci:chat-alt" class="text-gray-400 text-base" />
                            <span>{{ action.memo }}</span>
                        </div>
                        <div class="flex items-center gap-2 mt-1" v-if="action.id">
                            <div class="flex flex-row gap-1 items-center text-sm" v-if="action.senderNote">
                                <UIcon name="ci:chat-alt-check" class="text-blue-400 text-base" />
                                <span class="text-gray-500">{{ i18n.text["Sender Note"] }}: {{ action.senderNote }}</span>
                            </div>
                            <UButton icon="i-heroicons-pencil-square" color="primary" variant="subtle" size="xs" @click.stop="handleEditClick(action, 'sender')" class="text-xs">
                                {{ action.senderNote ? i18n.text["Edit"] : i18n.text["Add Note"] }}
                            </UButton>
                        </div>
                    </div>

                    <div class="py-3 text-center text-sm text-gray-400" v-if="sendPagination.loadingMore">
                        {{ i18n.text["Loading more"] }}
                    </div>
                    <div
                        class="py-3 text-center text-sm text-red-400 cursor-pointer border-t border-muted"
                        v-else-if="sendPagination.loadMoreError"
                        @click="loadMoreSend"
                    >
                        {{ i18n.text["Load failed, tap to retry"] }}
                    </div>
                    <div class="py-3 text-center text-sm text-gray-400" v-else-if="!sendPagination.hasMore && sendActions.length > 0">
                        {{ i18n.text["No more records"] }}
                    </div>
                    <div ref="sendSentinelRef" class="h-1 shrink-0" aria-hidden="true"></div>
                </div>
            </template>
            <template #receive="{ item }">
                <div ref="receiveListRef" class="flex flex-col flex-1 min-h-0 overflow-y-auto">
                    <div class="text-gray-400 text-sm" v-if="receiveActions.length === 0">
                        {{ i18n.text["No data available"] }}
                    </div>
                    <div class="flex flex-col gap-2 hover:bg-muted p-2 cursor-pointer border-b border-muted pb-2"
                        v-for="action in receiveActions" :key="action.txHex" @click="toExplorer(action.txHex)">
                        <div class="flex gap-2 w-full justify-between">
                            <div class="flex flex-row gap-2 justify-between items-center">
                                <div class="flex flex-col">
                                    <div class="font-medium">
                                        <span class="text-green-500 text-sm">{{ i18n.text["FROM"] }}: </span>
                                        <span v-if="action.senderHandle">{{ action.senderHandle }} ({{ formatAddress(action.from) }})</span>
                                        <span v-else>{{ formatAddress(action.from) }}</span>
                                    </div>
                                    <div class="text-gray-400 text-sm flex flex-row gap-1 items-center"
                                        v-if="action.token === 'NATIVE_COIN'">
                                        <div>
                                            {{ displayBalance(action.value, 6, 18) }}
                                            {{ useChain.chain.nativeCurrency.symbol }}
                                        </div>
                                    </div>
                                    <div class="text-gray-400 text-sm" v-else>
                                        {{ displayBalance(action.value, 6, action.decimals) }}
                                        {{ action.symbol }}
                                    </div>
                                </div>
                            </div>

                            <div class="flex flex-col gap-2 items-end">
                                <div class="text-gray-400 text-sm">
                                    {{ displayDate(action.date) }}
                                </div>
                                <div class="text-gray-400 text-sm">{{ action.status }}</div>
                            </div>
                        </div>

                        <div class="flex flex-row gap-1 items-center text-sm" v-if="action.memo">
                            <UIcon name="ci:chat-alt" class="text-gray-400 text-base" />
                            <span>{{ action.memo }}</span>
                        </div>
                        <div class="flex items-center gap-2 mt-1" v-if="action.id">
                            <div class="flex flex-row gap-1 items-center text-sm" v-if="action.receiverNote">
                                <UIcon name="ci:chat-alt-check" class="text-green-400 text-base" />
                                <span class="text-gray-500">{{ i18n.text["Receiver Note"] }}: {{ action.receiverNote }}</span>
                            </div>
                            <UButton icon="i-heroicons-pencil-square" color="primary" variant="subtle" size="xs" @click.stop="handleEditClick(action, 'receiver')" class="text-xs">
                                {{ action.receiverNote ? i18n.text["Edit"] : i18n.text["Add Note"] }}
                            </UButton>
                        </div>
                    </div>

                    <div class="py-3 text-center text-sm text-gray-400" v-if="receivePagination.loadingMore">
                        {{ i18n.text["Loading more"] }}
                    </div>
                    <div
                        class="py-3 text-center text-sm text-red-400 cursor-pointer border-t border-muted"
                        v-else-if="receivePagination.loadMoreError"
                        @click="loadMoreReceive"
                    >
                        {{ i18n.text["Load failed, tap to retry"] }}
                    </div>
                    <div class="py-3 text-center text-sm text-gray-400" v-else-if="!receivePagination.hasMore && receiveActions.length > 0">
                        {{ i18n.text["No more records"] }}
                    </div>
                    <div ref="receiveSentinelRef" class="h-1 shrink-0" aria-hidden="true"></div>
                </div>
            </template>
        </UTabs>

        <!-- 编辑备注 Modal -->
        <UModal v-model:open="showEditModal" :title="editType === 'sender' ? i18n.text['Sender Note'] : i18n.text['Receiver Note']">
            <template #body>
                <div class="flex flex-col gap-4">
                    <UFormField :label="editType === 'sender' ? i18n.text['Sender Note'] : i18n.text['Receiver Note']">
                        <UInput v-model="editNoteValue" :placeholder="editType === 'sender' ? i18n.text['Please enter sender note'] : i18n.text['Please enter receiver note']" class="w-full" size="xl" variant="subtle" />
                    </UFormField>
                </div>
            </template>
            <template #footer>
                <div class="flex justify-end gap-3 w-full">
                    <UButton color="neutral" variant="ghost" size="xl" @click="showEditModal = false">{{ i18n.text["Cancel"] }}</UButton>
                    <UButton color="primary" size="xl" :loading="savingNote" @click="saveNote">{{ i18n.text["Confirm"] }}</UButton>
                </div>
            </template>
        </UModal>
    </div>
</template>

<script setup lang="ts">
import { useUserStore } from "../stores/user";
import { useChainStore } from "../stores/chain";
import { useI18n } from "../stores/i18n";
import type { Chain } from "viem";
import { formatAddress, displayDate, displayBalance, type ActionPreview } from "../utils/display";
import {
    ACTIONS_INITIAL_PAGE_SIZE,
    ACTIONS_LOAD_MORE_SIZE,
    collectUniqueTxHexes,
    dedupeActionsByTxHex,
    getReceiveActions,
    getSendActionsV2,
    matchActionsWithTransactions,
} from "../utils/actions";
import type { TabsItem } from "@nuxt/ui";
import { getTransactions, setTransactionNote, getTokenClass } from "../utils/semi_api";

interface TabPaginationState {
    pageKey?: string;
    hasMore: boolean;
    loadingMore: boolean;
    loadMoreError: boolean;
}

const userStore = useUserStore();
const user = computed(() => userStore.user);
const loading = ref(false);
const useChain = useChainStore();
const i18n = useI18n();
const sendActions = ref<ActionPreview[]>([]);
const receiveActions = ref<ActionPreview[]>([]);
const toast = useToast();

const sendListRef = ref<HTMLElement | null>(null);
const receiveListRef = ref<HTMLElement | null>(null);
const sendSentinelRef = ref<HTMLElement | null>(null);
const receiveSentinelRef = ref<HTMLElement | null>(null);

const sendPagination = ref<TabPaginationState>({
    hasMore: true,
    loadingMore: false,
    loadMoreError: false,
});
const receivePagination = ref<TabPaginationState>({
    hasMore: true,
    loadingMore: false,
    loadMoreError: false,
});

let tokenClassesForChain: Awaited<ReturnType<typeof getTokenClass>>["token_classes"] = [];
let safeAddressForActions = "";

const router = useRouter();

// 编辑备注相关
const showEditModal = ref(false);
const savingNote = ref(false);
const editingAction = ref<ActionPreview | null>(null);
const editType = ref<'sender' | 'receiver'>('receiver');
const editNoteValue = ref("");

const handleEditClick = (action: ActionPreview, type: 'sender' | 'receiver') => {
    editingAction.value = action;
    editType.value = type;
    editNoteValue.value = (type === 'sender' ? action.senderNote : action.receiverNote) || "";
    showEditModal.value = true;
};

const saveNote = async () => {
    if (!editingAction.value?.id) return;

    savingNote.value = true;
    try {
        const params: any = { id: editingAction.value.id };
        if (editType.value === 'sender') {
            params.sender_note = editNoteValue.value;
        } else {
            params.receiver_note = editNoteValue.value;
        }

        await setTransactionNote(params);

        const updateNote = (action: ActionPreview) => {
            if (action.txHex === editingAction.value?.txHex) {
                if (editType.value === 'sender') {
                    return { ...action, senderNote: editNoteValue.value };
                } else {
                    return { ...action, receiverNote: editNoteValue.value };
                }
            }
            return action;
        };

        sendActions.value = sendActions.value.map(updateNote);
        receiveActions.value = receiveActions.value.map(updateNote);

        toast.add({
            title: i18n.text["Setup Success"],
            color: "success"
        });
        showEditModal.value = false;
    } catch (error) {
        console.error("Failed to save note:", error);
        toast.add({
            title: i18n.text["Error"],
            description: (error as Error).message,
            color: "error"
        });
    } finally {
        savingNote.value = false;
    }
};

const toExplorer = (tx: string) => {
    const url = useChain.chain.blockExplorers?.default?.url;
    window.open(`${url}/tx/${tx}`, "_blank");
};

const toSafeExplorer = () => {
    if (user.value?.evm_chain_address) {
        const url = useChain.chain.blockExplorers?.default?.url;
        window.open(`${url}/address/${user.value.evm_chain_address}`, "_blank");
    }
};

const tabs: TabsItem[] = [
    {
        label: i18n.text["Send"],
        slot: "send" as const,
    },
    {
        label: i18n.text["Receive"],
        slot: "receive" as const,
    },
];

const appendActions = (
    current: ActionPreview[],
    incoming: ActionPreview[]
) => dedupeActionsByTxHex([...current, ...incoming]);

const loadInitialActions = async (chain: Chain, safeAddress: string) => {
    loading.value = true;
    try {
        const { token_classes } = await getTokenClass();
        tokenClassesForChain = token_classes.filter((token) => token.chain_id === chain.id);
        safeAddressForActions = safeAddress;

        const fetchOptions = { maxCount: ACTIONS_INITIAL_PAGE_SIZE };
        const [sendResult, receiveResult] = await Promise.all([
            getSendActionsV2(safeAddress, chain, tokenClassesForChain, fetchOptions),
            getReceiveActions(safeAddress, chain, tokenClassesForChain, fetchOptions),
        ]);

        const combinedHashes = collectUniqueTxHexes(sendResult.actions, receiveResult.actions);
        const serverTransactionsList = combinedHashes
            ? await getTransactions(combinedHashes)
            : { transactions: [] };

        sendActions.value = matchActionsWithTransactions(
            sendResult.actions,
            serverTransactionsList.transactions
        );
        receiveActions.value = matchActionsWithTransactions(
            receiveResult.actions,
            serverTransactionsList.transactions
        );

        sendPagination.value = {
            pageKey: sendResult.pageKey,
            hasMore: !!sendResult.pageKey,
            loadingMore: false,
            loadMoreError: false,
        };
        receivePagination.value = {
            pageKey: receiveResult.pageKey,
            hasMore: !!receiveResult.pageKey,
            loadingMore: false,
            loadMoreError: false,
        };
    } catch (error) {
        console.error("Error loading actions:", error);
        toast.add({
            title: i18n.text["Error"],
            description: (error as Error).message,
            color: "error",
        });
        throw error;
    } finally {
        loading.value = false;
    }
};

const loadMoreSend = async () => {
    const pagination = sendPagination.value;
    if (
        pagination.loadingMore ||
        !pagination.hasMore ||
        !pagination.pageKey ||
        !safeAddressForActions
    ) {
        return;
    }

    sendPagination.value = {
        ...pagination,
        loadingMore: true,
        loadMoreError: false,
    };

    try {
        const result = await getSendActionsV2(
            safeAddressForActions,
            useChain.chain,
            tokenClassesForChain,
            { maxCount: ACTIONS_LOAD_MORE_SIZE, pageKey: pagination.pageKey }
        );

        const hashes = collectUniqueTxHexes(result.actions);
        const serverTransactionsList = hashes
            ? await getTransactions(hashes)
            : { transactions: [] };

        sendActions.value = appendActions(
            sendActions.value,
            matchActionsWithTransactions(result.actions, serverTransactionsList.transactions)
        );

        sendPagination.value = {
            pageKey: result.pageKey,
            hasMore: !!result.pageKey,
            loadingMore: false,
            loadMoreError: false,
        };
    } catch (error) {
        console.error("Error loading more send actions:", error);
        sendPagination.value = {
            ...sendPagination.value,
            loadingMore: false,
            loadMoreError: true,
        };
    }
};

const loadMoreReceive = async () => {
    const pagination = receivePagination.value;
    if (
        pagination.loadingMore ||
        !pagination.hasMore ||
        !pagination.pageKey ||
        !safeAddressForActions
    ) {
        return;
    }

    receivePagination.value = {
        ...pagination,
        loadingMore: true,
        loadMoreError: false,
    };

    try {
        const result = await getReceiveActions(
            safeAddressForActions,
            useChain.chain,
            tokenClassesForChain,
            { maxCount: ACTIONS_LOAD_MORE_SIZE, pageKey: pagination.pageKey }
        );

        const hashes = collectUniqueTxHexes(result.actions);
        const serverTransactionsList = hashes
            ? await getTransactions(hashes)
            : { transactions: [] };

        receiveActions.value = appendActions(
            receiveActions.value,
            matchActionsWithTransactions(result.actions, serverTransactionsList.transactions)
        );

        receivePagination.value = {
            pageKey: result.pageKey,
            hasMore: !!result.pageKey,
            loadingMore: false,
            loadMoreError: false,
        };
    } catch (error) {
        console.error("Error loading more receive actions:", error);
        receivePagination.value = {
            ...receivePagination.value,
            loadingMore: false,
            loadMoreError: true,
        };
    }
};

const setupInfiniteScroll = (
    listRef: Ref<HTMLElement | null>,
    sentinelRef: Ref<HTMLElement | null>,
    loadMore: () => void,
    getPagination: () => TabPaginationState
) => {
    watch(
        [listRef, sentinelRef],
        ([listEl, sentinelEl], _, onCleanup) => {
            if (!listEl || !sentinelEl) return;

            const observer = new IntersectionObserver(
                (entries) => {
                    const entry = entries[0];
                    const pagination = getPagination();
                    if (
                        entry?.isIntersecting &&
                        pagination.hasMore &&
                        !pagination.loadingMore &&
                        !pagination.loadMoreError
                    ) {
                        loadMore();
                    }
                },
                { root: listEl, rootMargin: "100px", threshold: 0 }
            );

            observer.observe(sentinelEl);
            onCleanup(() => observer.disconnect());
        },
        { flush: "post" }
    );
};

setupInfiniteScroll(sendListRef, sendSentinelRef, loadMoreSend, () => sendPagination.value);
setupInfiniteScroll(receiveListRef, receiveSentinelRef, loadMoreReceive, () => receivePagination.value);

onMounted(async () => {
    if (user.value?.evm_chain_address) {
        await loadInitialActions(useChain.chain, user.value.evm_chain_address);
    }
});
</script>
