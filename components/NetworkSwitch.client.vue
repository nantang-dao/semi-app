<template>
  <UDropdownMenu :items="networkItems">
    <img :src="currentNetworkIcon" alt="" class="w-9 h-9 block" />
  </UDropdownMenu>
</template>

<script setup lang="ts">
import { useChainStore, chainMap } from "../stores/chain";
import { useMultisigStore } from "../stores/multisig";
import { type Chain } from "viem/chains";

const chainStore = useChainStore();
const multisigStore = useMultisigStore();
const toast = useToast();

const networkItems = computed(() =>
  Object.values(chainMap).map(
    (chain) =>
      ({
        label: chain.name,
        onSelect: () => handleNetworkSwitch(chain),
        avatar: {
          src: chain.icon,
          size: "xs",
        },
      }) as const
  )
);

const currentNetworkIcon = computed(() => chainStore.chain.icon);

const handleNetworkSwitch = async (chain: Chain) => {
  try {
    await chainStore.switch(chain.id);
    multisigStore.alignActiveWalletToChain(chain.id);
    toast.add({
      title: "切换成功",
      description: `已切换到 ${chain.name} 网络`,
      color: "success",
    });
  } catch (error) {
    console.error(error);
    toast.add({
      title: "切换失败",
      description: "请稍后再试",
      color: "error",
    });
  }
};
</script>
