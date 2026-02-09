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
      <div>{{ i18n.text["Enter your login email"] }}</div>
      <UForm :state="formState" @submit="onSubmit" class="w-full">
        <UFormField name="email">
          <UInput
            type="email"
            size="xl"
            class="w-full"
            v-model="formState.email"
            :placeholder="i18n.text['Please enter email']"
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
          :disabled="loading || !formState.email"
        >
          {{ i18n.text.Next }}
        </UButton>
      </UForm>

      <div class="text-sm text-gray-500 flex justify-end w-full">
        <NuxtLink href="/login" class="text-primary flex items-center gap-1">
          <UIcon name="ci:phone" class="text-base" /> {{ i18n.text["Login with phone number"] }}
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { sendEmailCode } from "~/utils/semi_api";

definePageMeta({
  layout: "unauth",
});

const router = useRouter();
const route = useRoute();
const loading = ref(false);
const toast = useToast();
const i18n = useI18n();

const formState = reactive({
  email: "",
});

const goBack = () => {
  // If coming from OAuth, still go home (OAuth state is saved in cookie)
  router.push("/");
};

const validateEmail = (value: string) => {
  if (!value) return i18n.text["Please enter email"];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return i18n.text["Please enter email"];
  return true;
};

const onSubmit = async () => {
  loading.value = true;
  try {
    const validation = validateEmail(formState.email);
    if (validation === true) {
      await sendEmailCode(formState.email);

      // Check if coming from OAuth flow
      const redirectParam = route.query.redirect as string;

      // 使用查询参数对象而不是字符串拼接
      await router.push({
        path: '/verifyemail',
        query: {
          email: formState.email,
          ...(redirectParam === 'oauth' ? { redirect: 'oauth' } : {})
        }
      });
    } else {
      toast.add({
        title: i18n.text["Please enter correct email"],
        description: validation,
        color: "error",
      });
    }
  } finally {
    loading.value = false;
  }
};
</script>
