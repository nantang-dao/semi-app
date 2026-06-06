<template>
  <span class="inline-flex items-center gap-1">
    <span class="font-mono text-xs" :class="textClass">{{ displayAddress }}</span>
    <button
      class="shrink-0 text-gray-400 hover:text-primary-500 transition-colors"
      @click.stop="copyAddress"
    >
      <UIcon name="ci:copy" :size="iconSize" />
    </button>
  </span>
</template>

<script setup lang="ts">
import { useI18n } from '~/stores/i18n'

const props = withDefaults(defineProps<{
  address: string
  textClass?: string
  iconSize?: number
}>(), {
  textClass: '',
  iconSize: 12,
})

const i18n = useI18n()
const toast = useToast()

const displayAddress = computed(() => {
  if (!props.address || props.address.length < 10) return props.address
  return `${props.address.slice(0, 6)}...${props.address.slice(-4)}`
})

async function copyAddress() {
  if (!props.address) return
  try {
    await navigator.clipboard.writeText(props.address)
    toast.add({ title: i18n.text['Copy Success'] || 'Copied', color: 'success' })
  } catch {
    toast.add({ title: i18n.text['Copy Failed'] || 'Copy failed', color: 'error' })
  }
}
</script>
