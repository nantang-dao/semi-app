<template>
  <div class="w-12 h-12 rounded-full overflow-hidden bg-gray-500 my-4" v-if="imageUrl">
    <img :src="imageUrl" alt="icon" class="object-cover w-full h-full" />
  </div>
  <UButton
    variant="outline"
    color="neutral"
    size="md"
    @click="handleUploadIcon"
    :loading="uploading"
    :disabled="uploading"
  >
    {{ i18n.text["Upload Icon"] }}
  </UButton>
</template>

<script setup lang="ts">
import { uploadFile } from "~/utils/semi_api";

const i18n = useI18n();
const toast = useToast();

// 定义 props 和 emit
interface Props {
  modelValue?: string;
}

interface Emits {
  (e: "update:modelValue", value: string): void;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: "",
});

const emit = defineEmits<Emits>();

const uploading = ref(false);
const imageUrl = computed({
  get: () => props.modelValue,
  set: (value: string) => emit("update:modelValue", value),
});

interface ChooseFileOption {
  accepts?: string[];
  validator?: (file: File) => void;
}

const chooseFile = async (opts?: ChooseFileOption): Promise<File[]> => {
  return new Promise((resolve) => {
    const el = document.createElement("input");
    el.id = "choose-file";
    el.style.position = "absolute";
    el.style.visibility = "hidden";
    el.style.top = "0";
    el.style.left = "0";

    el.type = "file";
    el.accept = opts?.accepts?.join(",") || "";
    el.addEventListener("change", () => {
      if (!el.files?.length) {
        return;
      }

      const files = Array.from(el.files);
      const { validator } = opts || {};
      files.forEach((file) => {
        if (opts?.accepts?.length && !opts.accepts.includes(file.type)) {
          throw new Error("");
        }

        if (validator) {
          validator(file);
        }
      });
      resolve(files);
      el.remove();
    });

    window.addEventListener("focus", () => {
      if (!el.files?.length) {
        el.remove();
      }
    });

    document.body.appendChild(el);
    el.click();
  });
};

const handleUploadIcon = async () => {
  try {
    const files = await chooseFile({
      accepts: ["image/png", "image/jpeg", "image/webp"],
    });
    const reader = new FileReader();
    reader.readAsDataURL(files[0]);
    reader.onload = async () => {
      const baseData = reader.result as string;
      let byteString;
      if (baseData!.split(",")[0].indexOf("base64") >= 0) byteString = atob(baseData.split(",")[1]);
      else {
        byteString = unescape(baseData.split(",")[1]);
      }
      const mime_type = baseData.split(",")[0].split(":")[1].split(";")[0];
      const ia = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([ia], { type: mime_type });

      uploading.value = true;
      const url = await uploadFile(blob);
      imageUrl.value = url;
      uploading.value = false;
    };
  } catch (e) {
    console.error(e);
    uploading.value = false;
    toast.add({
      title: i18n.text["Upload Failed"],
      description: i18n.text["Please try again"],
      color: "error",
    });
  }
};
</script>
