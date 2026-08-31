<template>
  <UModal
    v-model:open="open"
    :title="i18n.text['Scan QR Code']"
    :close="{
      color: 'primary',
      variant: 'outline',
      class: 'rounded-full',
    }"
  >
    <UButton
      icon="i-ci-qr-code"
      color="neutral"
      variant="subtle"
      size="xl"
      class="text-2xl cursor-pointer"
      @click="open = true"
    />

    <template #body>
      <div class="relative">
        <div class="loading-bg">
          <QrcodeStream v-if="open" :track="paintBoundingBox" @detect="onDetect" @error="onError" />
        </div>
        <div v-if="error" class="text-red-500 mt-2">{{ error }}</div>
      </div>
    </template>
  </UModal>
</template>

<script setup>
import { defineAsyncComponent, ref } from "vue";

// 摄像头扫码库（vue-qrcode-reader + zxing wasm）体积很大，且大多数用户从不扫码，
// 所以只在弹窗真正打开时才动态加载。
const QrcodeStream = defineAsyncComponent(() =>
  import("vue-qrcode-reader").then((m) => m.QrcodeStream),
);

const emit = defineEmits(["onDetect"]);
const open = ref(false);
const result = ref("");
const error = ref("");

// 获取i18n store
const i18n = useI18n();

function paintBoundingBox(detectedCodes, ctx) {
  for (const detectedCode of detectedCodes) {
    const {
      boundingBox: { x, y, width, height },
    } = detectedCode;

    ctx.lineWidth = 2;
    ctx.strokeStyle = "#007bff";
    ctx.strokeRect(x, y, width, height);
  }
}

function onError(err) {
  error.value = `[${err.name}]: `;

  if (err.name === "NotAllowedError") {
    error.value += i18n.text["You need to grant camera access permission"];
  } else if (err.name === "NotFoundError") {
    error.value += i18n.text["No camera on this device"];
  } else if (err.name === "NotSupportedError") {
    error.value += i18n.text["Secure context required (HTTPS, localhost)"];
  } else if (err.name === "NotReadableError") {
    error.value += i18n.text["Is the camera already in use?"];
  } else if (err.name === "OverconstrainedError") {
    error.value += i18n.text["Installed cameras are not suitable"];
  } else if (err.name === "StreamApiNotSupportedError") {
    error.value += i18n.text["Stream API is not supported in this browser"];
  } else if (err.name === "InsecureContextError") {
    error.value +=
      i18n.text[
        "Camera access is only permitted in secure context. Use HTTPS or localhost rather than HTTP."
      ];
  } else {
    error.value += err.message;
  }
}

function onDetect(detectedCodes) {
  const values = detectedCodes.map((code) => code.rawValue);
  result.value = JSON.stringify(values);
  open.value = false;
  emit("onDetect", values);
}
</script>
