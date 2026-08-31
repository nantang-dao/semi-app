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
        <div class="loading-bg relative w-full aspect-square overflow-hidden rounded-lg bg-black">
          <video
            ref="videoRef"
            class="w-full h-full object-cover"
            muted
            playsinline
            autoplay
          ></video>
          <div
            v-if="status !== 'scanning'"
            class="absolute inset-0 flex items-center justify-center text-white text-sm"
          >
            {{ status === "starting" ? i18n.text["Starting camera"] : i18n.text["Camera unavailable"] }}
          </div>
        </div>
        <div v-if="error" class="text-red-500 mt-2">{{ error }}</div>
      </div>
    </template>
  </UModal>
</template>

<script setup>
import { onBeforeUnmount, ref, watch } from "vue";

const emit = defineEmits(["onDetect"]);
const open = ref(false);
const error = ref("");
const status = ref("starting");
const videoRef = ref(null);

const i18n = useI18n();

// 满分辨率逐帧解码没有必要：QR 的模块在远低于摄像头原生尺寸时依然可分辨。
const DECODE_MAX_SIDE = 640;
// 约 10fps。再快也没收益（人举着手机对准也要几百毫秒），却能让旧手机的主线程空出来。
const DECODE_INTERVAL_MS = 100;
// 原生 detector 可能存在、声称支持 qr_code，却每次调用都失败（Chrome 的 Shape
// Detection 服务不可用、部分 Android WebView）。连续失败这么多次就换 JS 解码器，
// 否则界面会一直扫不出东西，每秒刷十条报错。
const DETECT_FAILURES_BEFORE_FALLBACK = 3;

/**
 * Chrome/Android 有原生 detector，比任何 JS 实现都快。Safari —— 也就是 iOS 上
 * 的所有浏览器 —— 没有实现（iOS 17 短暂地放在 flag 后面，18 又退回去了）。
 * 所以下面的 JS 解码器是硬需求而不是锦上添花。
 */
async function createNativeDetector() {
  const Ctor = globalThis.BarcodeDetector;
  if (!Ctor) return null;

  try {
    // 构造函数存在不代表平台后端支持这个格式。
    const formats = await Ctor.getSupportedFormats?.();
    if (formats && !formats.includes("qr_code")) return null;
    return new Ctor({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

let stream = null;
let closed = true;
let timer;
let frameHandle = 0;

// 每条退出路径都要走这里：必须释放摄像头，否则指示灯一直亮着，设备也维持着采集会话。
function teardown() {
  closed = true;
  clearTimeout(timer);
  cancelAnimationFrame(frameHandle);
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  if (videoRef.value) videoRef.value.srcObject = null;
}

function fail(message) {
  if (closed) return;
  status.value = "failed";
  error.value = message;
}

function describeError(err) {
  const map = {
    NotAllowedError: i18n.text["You need to grant camera access permission"],
    NotFoundError: i18n.text["No camera on this device"],
    NotSupportedError: i18n.text["Secure context required (HTTPS, localhost)"],
    NotReadableError: i18n.text["Is the camera already in use?"],
    OverconstrainedError: i18n.text["Installed cameras are not suitable"],
  };
  return `[${err.name}]: ${map[err.name] ?? err.message}`;
}

async function start() {
  closed = false;
  error.value = "";
  status.value = "starting";

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  if (!navigator.mediaDevices?.getUserMedia) {
    fail(i18n.text["Camera access is only permitted in secure context. Use HTTPS or localhost rather than HTTP."]);
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      // 对着别人手机扫的是后置摄像头。
      video: { facingMode: { ideal: "environment" } },
    });
  } catch (e) {
    console.error(e);
    fail(describeError(e));
    return;
  }

  // 权限弹窗还开着时被关掉了：立刻释放，否则这条流没人再去停它。
  const video = videoRef.value;
  if (closed || !video) {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    return;
  }

  video.srcObject = stream;
  // iOS Safari 需要这个属性才会内联播放而不是全屏。
  video.setAttribute("playsinline", "true");
  try {
    await video.play();
  } catch (e) {
    console.error(e);
    fail(describeError(e));
    return;
  }

  if (closed) return;
  status.value = "scanning";

  let detector = await createNativeDetector();
  // 解码器只在没有原生 detector 时才下载，约 1800 行的纯 JS，无 wasm、无 CDN。
  let decodeQR = detector ? null : (await import("~/utils/qrcode")).decodeQR;
  let detectFailures = 0;

  async function loadFallbackDecoder() {
    if (!decodeQR) decodeQR = (await import("~/utils/qrcode")).decodeQR;
    detector = null;
  }

  function handleResult(value) {
    if (closed || !value) return;
    teardown();
    open.value = false;
    emit("onDetect", [value]);
  }

  async function scanFrame() {
    if (closed) return;

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return;

    if (detector) {
      try {
        const results = await detector.detect(video);
        detectFailures = 0;
        if (results[0]?.rawValue) handleResult(results[0].rawValue);
      } catch (e) {
        detectFailures++;
        if (detectFailures >= DETECT_FAILURES_BEFORE_FALLBACK) {
          console.error("[qrcode] native detector unusable, falling back", e);
          await loadFallbackDecoder();
        }
      }
      return;
    }

    if (!ctx || !decodeQR) return;

    const scale = Math.min(1, DECODE_MAX_SIDE / Math.max(width, height));
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const value = decodeQR(data, canvas.width, canvas.height);
    if (value) handleResult(value);
  }

  async function loop() {
    if (closed) return;
    await scanFrame();
    if (closed) return;
    timer = setTimeout(() => {
      frameHandle = requestAnimationFrame(loop);
    }, DECODE_INTERVAL_MS);
  }

  await loop();
}

watch(open, (isOpen) => {
  if (isOpen) {
    // 等 UModal 把 <video> 真正挂上去。
    nextTick(start);
  } else {
    teardown();
  }
});

onBeforeUnmount(teardown);
</script>
