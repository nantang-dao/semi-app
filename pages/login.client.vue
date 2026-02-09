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
      <h1 class="text-2xl font-bold">{{ i18n.text.Login }}</h1>
      <div>{{ i18n.text["Enter your login phone number"] }}</div>
      <UForm :state="formState" @submit="onSubmit" class="w-full">
        <UFormField name="phone">
          <UInput
            size="xl"
            class="w-full"
            v-model="formState.phone"
            :placeholder="i18n.text['Please enter phone number']"
            :ui="{ base: 'w-full' }"
            :disabled="loading"
            variant="subtle"
          />
        </UFormField>
        <UButton
          type="submit"
          color="primary"
          class="w-full mt-4 flex justify-center items-center"
          size="xl"
          :loading="loading"
          :disabled="loading || !formState.phone"
        >
          {{ i18n.text.Next }}
        </UButton>
      </UForm>
      <div class="text-sm text-gray-500 flex justify-end w-full">
        <NuxtLink href="/email-login" class="text-primary flex items-center gap-1">
          <UIcon name="ci:mail" class="text-base" /> {{ i18n.text["Login with email"] }}
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { sendSMS } from "~/utils/semi_api";

definePageMeta({
  layout: "unauth",
});

const router = useRouter();
const route = useRoute();
const loading = ref(false);
const toast = useToast();
const i18n = useI18n();

const formState = reactive({
  phone: "",
});

const goBack = () => {
  // If coming from OAuth, still go home (OAuth state is saved in cookie)
  router.push("/");
};

const validatePhone = (value: string) => {
  if (!value) return i18n.text["Please enter phone number"];
  if (!/^\d{11}$/.test(value)) return i18n.text["Please enter phone number"];
  return true;
};

const onSubmit = async () => {
  loading.value = true;
  try {
    const validation = validatePhone(formState.phone);
    if (validation === true) {
      await sendSMS(formState.phone);

      // Check if coming from OAuth flow
      const redirectParam = route.query.redirect as string;

      // 使用查询参数对象而不是字符串拼接
      await router.push({
        path: '/verifyphone',
        query: {
          phone: formState.phone,
          ...(redirectParam === 'oauth' ? { redirect: 'oauth' } : {})
        }
      });
    } else {
      toast.add({
        title: i18n.text["Please enter correct phone number"],
        description: validation,
        color: "error",
      });
    }
  } finally {
    loading.value = false;
  }
};
</script>
