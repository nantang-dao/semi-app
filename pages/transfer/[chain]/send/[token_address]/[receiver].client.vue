<template>
  <div class="flex flex-col container-size rounded-xl bg-[var(--ui-bg)] shadow-lg p-4">
    <UButton
      icon="i-heroicons-arrow-left"
      color="neutral"
      variant="ghost"
      class="self-start mb-4"
      @click="navigateTo('/transfer')"
    >
      {{ i18n.text["Back"] }}
    </UButton>
    <div class="flex flex-col items-center justify-center h-full gap-3 py-10">
      <div class="text-xl font-bold">{{ i18n.text["Loading"] }}</div>
      <div class="text-gray-500 text-sm">Redirecting…</div>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute();
const i18n = useI18n();

const firstParam = (v: unknown): string => {
  if (Array.isArray(v)) return String(v[0] ?? "");
  return String(v ?? "");
};

onMounted(async () => {
  const chain = firstParam(route.params.chain);
  const tokenAddress = firstParam(route.params.token_address);
  const receiver = firstParam(route.params.receiver);
  const metadata = firstParam(route.params.metadata);

  const amount = (() => {
    const v = route.query.amount;
    if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : undefined;
    return typeof v === "string" ? v : undefined;
  })();

  await navigateTo({
    path: "/transfer",
    query: {
      chain_id: chain,
      token_address: tokenAddress === "native" ? undefined : tokenAddress,
      to: receiver,
      amount,
      metadata,
    },
    replace: true,
  });
});
</script>
