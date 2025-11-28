<template>
  <div class="flex flex-col items-center justify-center gap-2 my-8">
    <UIcon name="hugeicons:image-01" class="text-green-500/50 text-[90px]" />
    <div class="text-gray-500">{{ i18n.text["No NFTs Yet"] }}</div>
  </div>
</template>

<script setup lang="ts">
const i18n = useI18n();
</script>

<style scoped></style>

