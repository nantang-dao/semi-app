<template>
  <div class="flex flex-col container-size rounded-xl bg-[var(--ui-bg)] shadow-lg p-4">
    <UButton
      icon="i-heroicons-arrow-left"
      color="neutral"
      variant="ghost"
      class="self-start mb-4"
      @click="goBack"
    >
      {{ i18n.text.Back }}
    </UButton>
    <div class="flex flex-col items-center justify-center h-full gap-4 py-8 w-[80%] mx-auto">
      <h1 class="text-2xl font-bold">{{ i18n.text["Verify Phone Number"] }}</h1>
      <div>
        {{ i18n.text["Please enter the 6-digit verification code received by"]
        }}<span class="text-primary font-semibold mx-1"
          >{{ phone.slice(0, 3) }}...{{ phone.slice(-4) }}</span
        >
      </div>
      <UForm :state="formState" @submit="onSubmit" class="w-full">
        <UFormField name="pin">
          <UPinInput
            variant="subtle"
            type="number"
            v-model="formState.pin"
            :length="6"
            size="xl"
            class="w-full"
            :ui="{ base: 'w-full' }"
            :disabled="loading"
          />
        </UFormField>
        <div class="flex justify-between items-center mt-2">
          <UButton
            type="button"
            color="neutral"
            variant="ghost"
            :disabled="countdown > 0 || loading"
            @click="resendCode"
          >
            {{
              countdown > 0
                ? i18n.text["Resend ({countdown})"].replace("{countdown}", countdown.toString())
                : i18n.text["Resend Code"]
            }}
          </UButton>
        </div>
        <UButton
          type="submit"
          color="primary"
          class="w-full mt-4 flex justify-center items-center"
          size="xl"
          :loading="loading"
          :disabled="loading"
        >
          {{ i18n.text.Verify }}
        </UButton>
      </UForm>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { sendSMS, signIn } from "~/utils/semi_api";
import { useUserStore } from "~/stores/user";
import { serializeError } from "serialize-error";

definePageMeta({
  layout: "unauth",
});

const router = useRouter();
const route = useRoute();
const phone = computed(() => (route.query.phone as string) || "");
const loading = ref(false);
const countdown = ref(60);
const toast = useToast();
const userStore = useUserStore();
const i18n = useI18n();

const goBack = () => {
  const redirectParam = route.query.redirect as string;
  const redirectQuery = redirectParam === "oauth" ? "?redirect=oauth" : "";
  router.push(`/login${redirectQuery}`);
};

const startCountdown = () => {
  countdown.value = 60;
  const timer = setInterval(() => {
    countdown.value--;
    if (countdown.value <= 0) {
      clearInterval(timer);
    }
  }, 1000);
};

const resendCode = async () => {
  if (countdown.value > 0) return;
  loading.value = true;
  try {
    const response = await sendSMS(phone.value);
    if (response.result === "ok") {
      toast.add({
        title: i18n.text["Code sent successfully"],
        description: i18n.text["Verification code has been sent to your phone"],
        color: "success",
      });
      startCountdown();
    }
  } catch (error) {
    console.error("发送验证码失败:", error);
    toast.add({
      title: i18n.text["Failed to send verification code"],
      description: i18n.text["Please try again later"],
      color: "error",
    });
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  startCountdown();
});

const formState = reactive({
  pin: Array(8).fill(""),
});

const validatePin = (value: string[]) => {
  const pin = value.join("");
  if (!pin) return i18n.text["Please enter verification code"];
  if (!/^\d{6}$/.test(pin)) return i18n.text["Please enter 6-digit verification code"];
  return true;
};

const onSubmit = async () => {
  loading.value = true;
  try {
    const validation = validatePin(formState.pin);
    if (validation === true) {
      const response = await signIn(phone.value, formState.pin.join(""));
      if (response.result === "ok") {
        const user = await getMe();
        userStore.setUser(user);
        toast.add({
          title: i18n.text["Verification successful"],
          description: "",
          color: "success",
        });

        // Check if coming from OAuth flow
        const redirectParam = route.query.redirect as string;
        if (redirectParam === "oauth") {
          // Redirect back to OAuth authorize endpoint to continue the flow
          // 使用 window.location.href 而不是 router.push，因为这是服务器 API 路由
          window.location.href = "/api/oauth/authorize";
        } else {
          await router.push("/");
        }
      }
    } else {
      toast.add({
        title: i18n.text["Please enter 6-digit verification code"],
        description: validation,
        color: "error",
      });
    }
  } catch (error) {
    console.error("验证失败:", error);
    try {
      $fetch("/api/log-error", {
        method: "POST",
        body: {
          error: serializeError(error),
          href: window.location.href,
          info: {
            ...formState,
            phone: phone.value,
          },
          wallet_address: "",
        },
      });
    } catch (error) {
      console.warn("log error failed:", error);
    }
    toast.add({
      title: i18n.text["Verification failed"],
      description: i18n.text["Please check if the verification code is correct"],
      color: "error",
    });
  } finally {
    loading.value = false;
  }
};
</script>
