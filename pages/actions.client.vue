<template>
    <div class="flex flex-col container-size h-[100vh] rounded-xl bg-[var(--ui-bg)] shadow-lg px-4 sm:px-8 py-8 banner">
        <UButton icon="i-heroicons-arrow-left" color="neutral" variant="ghost" class="self-start mb-4"
            @click="router.push('/')">
            {{ i18n.text["Back"] }}
        </UButton>

        <div class="flex items-center justify-between mb-4">
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
        <UTabs :items="tabs" class="w-full overflow-auto" v-else>
            <template #send="{ item }">
                <div class="text-gray-400 text-sm" v-if="sendActions.length === 0">
                    {{ i18n.text["No data available"] }}
                </div>

                <div class="flex flex-col gap-2 hover:bg-muted p-2 cursor-pointer border-b border-muted pb-2"
                    v-for="(action, index) in sendActions" :key="index" @click="toExplorer(action.txHex)">
                    <div class="flex gap-2 w-full justify-between">
                        <div class="flex flex-row gap-2 justify-between items-center">
                            <div class="flex flex-col">
                                <div class="font-medium">
                                    <span class="text-red-400 text-sm">{{ i18n.text["TO"] }}: </span>{{
                                        formatAddress(action.to) }}
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
            </template>
            <template #receive="{ item }">
                <div class="text-gray-400 text-sm" v-if="receiveActions.length === 0">
                    {{ i18n.text["No data available"] }}
                </div>
                <div class="flex flex-col gap-2 hover:bg-muted p-2 cursor-pointer border-b border-muted pb-2"
                    v-for="(action, index) in receiveActions" :key="index" @click="toExplorer(action.txHex)">
                    <div class="flex gap-2 w-full justify-between">
                        <div class="flex flex-row gap-2 justify-between items-center">
                            <div class="flex flex-col">
                                <div class="font-medium">
                                    <span class="text-green-500 text-sm">{{ i18n.text["FROM"] }}: </span>{{
                                        formatAddress(action.to) }}
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
import { getReceiveActions, getSendActionsV2 } from "../utils/actions";
import type { TabsItem } from "@nuxt/ui";
import { getTransactions, setTransactionNote, getTokenClass } from "../utils/semi_api";

const userStore = useUserStore();
const user = computed(() => userStore.user);
const loading = ref(false);
const useChain = useChainStore();
const i18n = useI18n();
const sendActions = ref<ActionPreview[]>([]);
const receiveActions = ref<ActionPreview[]>([]);
const toast = useToast();

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

        // 更新本地状态
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

onMounted(async () => {
    const updateActions = async (chain: Chain, safeAddress: string) => {
        loading.value = true;
        try {
            const { token_classes } = await getTokenClass();
            const currentTokenClasses = token_classes.filter((token) => token.chain_id === chain.id);
            const tasks = [
                getSendActionsV2(safeAddress, chain, currentTokenClasses),
                getReceiveActions(safeAddress, chain, currentTokenClasses),
            ];
            let [sendActionsList, receiveActionsList] = await Promise.all(tasks);

            // 默认获取所有交易记录以确保 ID 匹配
            const serverTransactionsList = await getTransactions();
            console.log("[serverTransactionsList]:", serverTransactionsList);

            const matchTx = (action: ActionPreview) => {
                const tx = serverTransactionsList?.transactions?.find(
                    (tx) => tx.tx_hash.toLowerCase() === action.txHex.toLowerCase()
                );
                return {
                    ...action,
                    id: tx?.id,
                    memo: tx?.memo || action.memo,
                    senderNote: tx?.sender_note,
                    receiverNote: tx?.receiver_note
                };
            };

            sendActions.value = sendActionsList.map(matchTx);
            receiveActions.value = receiveActionsList.map(matchTx);
            console.log("[sendActions]:", sendActions.value);
            console.log("[receiveActions]:", receiveActions.value);
        } catch (error) {
            console.error("Error updating recipients:", error);
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

    if (user.value?.evm_chain_address) {
        updateActions(useChain.chain, user.value?.evm_chain_address!);
    }
});
</script>
