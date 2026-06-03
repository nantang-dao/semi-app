<template>
  <UModal :title="i18n.text['gas.estimatedFee'] || i18n.text['Estimated Fee']">
    <UIcon name="i-ci-info" size="18" class="cursor-pointer hover:text-primary-500" />
    <template #body>
      <div class="text-sm">
        {{
          i18n.text[
            "gas.estimatedTooltip"
          ] || i18n.text[
            "Includes fees paid to bundler and paymaster. This is an approximate value, subject to the final gas usage after transaction completion."
          ]
        }}
      </div>
    </template>
  </UModal>
</template>

<script setup>
const i18n = useI18n();
</script>
