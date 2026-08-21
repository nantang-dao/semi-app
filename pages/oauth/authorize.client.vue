<template>
  <div class="flex flex-col container-size rounded-xl bg-[var(--ui-bg)] shadow-lg p-4">
    <!-- Loading -->
    <div v-if="status === 'loading'" class="flex justify-center items-center h-full py-16">
      <UIcon name="i-heroicons-arrow-path" class="animate-spin text-4xl text-primary" />
    </div>

    <!-- Error -->
    <div v-else-if="status === 'error'" class="flex flex-col items-center justify-center h-full gap-4 py-8 w-[80%] mx-auto">
      <UIcon name="i-heroicons-exclamation-triangle" class="text-5xl text-red-500" />
      <h1 class="text-xl font-bold text-center">{{ t('oauth.authError', 'Authorization Error') }}</h1>
      <p class="text-center text-gray-500">{{ errorMessage }}</p>
    </div>

    <!-- Needs login -->
    <div v-else-if="status === 'needs_login'" class="flex flex-col items-center justify-center h-full gap-4 py-8 w-[80%] mx-auto">
      <UIcon name="i-heroicons-lock-closed" class="text-5xl text-primary" />
      <h1 class="text-2xl font-bold text-center">{{ t('oauth.signInTitle', 'Sign in to continue') }}</h1>
      <p class="text-center text-gray-500">
        {{ t('oauth.signInDesc', 'You must be signed in to authorize this application.') }}
      </p>
      <UButton color="primary" size="xl" class="w-full" @click="redirectToLogin">
        {{ t('oauth.signIn', 'Sign In') }}
      </UButton>
    </div>

    <!-- Consent -->
    <div v-else-if="status === 'consent' && appInfo" class="flex flex-col items-center gap-4 py-8 w-[80%] mx-auto">
      <UIcon name="i-heroicons-shield-check" class="text-5xl text-primary" />
      <h1 class="text-2xl font-bold text-center">{{ appInfo.app_name }}</h1>
      <p class="text-gray-500 text-center text-sm">
        {{ t('oauth.wantsAccess', 'wants permission to access your Semi account') }}
      </p>

      <div class="w-full border border-gray-200 dark:border-gray-700 rounded-xl divide-y divide-gray-200 dark:divide-gray-700 my-2">
        <div
          v-for="scope in appInfo.scopes"
          :key="scope"
          class="flex items-center gap-3 px-4 py-3"
        >
          <UIcon name="i-heroicons-check-circle" class="text-green-500 flex-shrink-0 text-xl" />
          <div>
            <p class="font-medium text-sm">{{ scopeTitle(scope) }}</p>
            <p class="text-xs text-gray-500">{{ scopeDesc(scope) }}</p>
          </div>
        </div>
      </div>

      <p class="text-xs text-gray-400 text-center">
        {{ disclaimer }}
      </p>

      <div class="flex gap-3 w-full mt-2">
        <UButton
          color="neutral"
          variant="outline"
          size="xl"
          class="flex-1"
          :disabled="loading"
          @click="onDeny"
        >
          {{ t('oauth.deny', 'Deny') }}
        </UButton>
        <UButton
          color="primary"
          size="xl"
          class="flex-1"
          :loading="loading"
          @click="onAccept"
        >
          {{ t('oauth.authorize', 'Authorize') }}
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  generateCodeVerifier,
  generateCodeChallenge,
  saveOAuthParams,
  loadOAuthParams,
  clearOAuthParams,
  type OAuthPendingParams,
} from "~/utils/oauth"
import { getCookie } from "~/utils/semi_api"
import { useI18n } from "~/stores/i18n"

definePageMeta({ layout: "unauth" })

const route = useRoute()
const router = useRouter()
const i18n = useI18n()

// i18n.text is typed from the en.json import, so dynamic keys need a widened view.
const text = computed(() => i18n.text as Record<string, string | undefined>)

// Falls back to the English literal when a key is missing from the active locale.
const t = (key: string, fallback: string) => text.value[key] ?? fallback

const status = ref<"loading" | "needs_login" | "consent" | "error">("loading")
const errorMessage = ref("")
const appInfo = ref<{ app_name: string; scopes: string[]; client_id: string } | null>(null)
const oauthParams = ref<OAuthPendingParams | null>(null)
const loading = ref(false)

// Scope copy lives in assets/i18n/*.json under `oauth.scope.<scope>.{title,desc}`;
// an unknown scope falls back to showing the raw scope string.
const scopeTitle = (scope: string) => text.value[`oauth.scope.${scope}.title`] ?? scope
const scopeDesc = (scope: string) => text.value[`oauth.scope.${scope}.desc`] ?? ""

const disclaimer = computed(() =>
  t(
    "oauth.disclaimer",
    "By authorizing, you agree to share the listed information with {app}. You can revoke access at any time from your profile settings."
  ).replace("{app}", appInfo.value?.app_name ?? "")
)

onMounted(async () => {
  const fromUrl = {
    client_id: route.query.client_id as string,
    redirect_uri: route.query.redirect_uri as string,
    scope: (route.query.scope as string) || "openid profile",
    state: (route.query.state as string) || "",
    response_type: (route.query.response_type as string) || "code",
  }

  let pending: OAuthPendingParams | null = null

  if (fromUrl.client_id && fromUrl.redirect_uri) {
    const clientChallenge = route.query.code_challenge as string
    const clientChallengeMethod = (route.query.code_challenge_method as string) || "S256"

    if (clientChallenge) {
      // Third-party client (e.g. Hola) already generated PKCE — use it as-is.
      // The client holds the code_verifier; we only need to forward the challenge.
      pending = {
        ...fromUrl,
        code_verifier: "",
        code_challenge: clientChallenge,
        code_challenge_method: clientChallengeMethod as "S256",
        response_type: "code",
      } as OAuthPendingParams
    } else {
      // First-party flow (no external client) — generate PKCE here.
      const verifier = generateCodeVerifier()
      const challenge = await generateCodeChallenge(verifier)
      pending = {
        ...fromUrl,
        code_verifier: verifier,
        code_challenge: challenge,
        code_challenge_method: "S256",
        response_type: "code",
      } as OAuthPendingParams
    }
    saveOAuthParams(pending)
  } else {
    // Returning from login — restore from sessionStorage
    pending = loadOAuthParams()
  }

  if (!pending) {
    status.value = "error"
    errorMessage.value = t(
      "oauth.missingParams",
      "Missing OAuth parameters. Please restart the authorization flow."
    )
    return
  }

  oauthParams.value = pending

  if (!getCookie("semi_auth_token")) {
    status.value = "needs_login"
    return
  }

  try {
    const result = await $fetch("/api/oauth/authorize", {
      method: "GET",
      query: {
        client_id: pending.client_id,
        redirect_uri: pending.redirect_uri,
        scope: pending.scope,
        state: pending.state,
        response_type: "code",
        code_challenge: pending.code_challenge,
        code_challenge_method: "S256",
      },
    }) as { app_name: string; scopes: string[]; client_id: string }
    appInfo.value = result
    status.value = "consent"
  } catch (err: any) {
    status.value = "error"
    errorMessage.value =
      err?.data?.statusMessage ||
      err?.statusMessage ||
      t("oauth.invalidRequest", "Invalid authorization request.")
  }
})

const redirectToLogin = () => {
  router.push({ path: "/login", query: { redirect: "oauth" } })
}

const onAccept = async () => {
  if (!oauthParams.value) return
  loading.value = true
  try {
    const result = await $fetch("/api/oauth/authorize", {
      method: "POST",
      body: {
        client_id: oauthParams.value.client_id,
        redirect_uri: oauthParams.value.redirect_uri,
        scope: oauthParams.value.scope,
        state: oauthParams.value.state,
        code_challenge: oauthParams.value.code_challenge,
        code_challenge_method: "S256",
        action_choice: "accept",
      },
    }) as { code: string; redirect_uri: string; state: string }

    clearOAuthParams()

    const uri = new URL(result.redirect_uri)
    uri.searchParams.set("code", result.code)
    if (result.state) uri.searchParams.set("state", result.state)
    window.location.href = uri.toString()
  } catch (err: any) {
    errorMessage.value =
      err?.data?.statusMessage || err?.statusMessage || t("oauth.authFailed", "Authorization failed.")
    status.value = "error"
  } finally {
    loading.value = false
  }
}

const onDeny = () => {
  if (!oauthParams.value) return
  const uri = new URL(oauthParams.value.redirect_uri)
  uri.searchParams.set("error", "access_denied")
  if (oauthParams.value.state) uri.searchParams.set("state", oauthParams.value.state)
  clearOAuthParams()
  window.location.href = uri.toString()
}
</script>
