<template>
  <div class="flex flex-col container-size rounded-xl bg-[var(--ui-bg)] shadow-lg p-4">
    <!-- Loading -->
    <div v-if="status === 'loading'" class="flex justify-center items-center h-full py-16">
      <UIcon name="i-heroicons-arrow-path" class="animate-spin text-4xl text-primary" />
    </div>

    <!-- Error -->
    <div v-else-if="status === 'error'" class="flex flex-col items-center justify-center h-full gap-4 py-8 w-[80%] mx-auto">
      <UIcon name="i-heroicons-exclamation-triangle" class="text-5xl text-red-500" />
      <h1 class="text-xl font-bold text-center">Authorization Error</h1>
      <p class="text-center text-gray-500">{{ errorMessage }}</p>
    </div>

    <!-- Needs login -->
    <div v-else-if="status === 'needs_login'" class="flex flex-col items-center justify-center h-full gap-4 py-8 w-[80%] mx-auto">
      <UIcon name="i-heroicons-lock-closed" class="text-5xl text-primary" />
      <h1 class="text-2xl font-bold text-center">Sign in to continue</h1>
      <p class="text-center text-gray-500">You must be signed in to authorize this application.</p>
      <UButton color="primary" size="xl" class="w-full" @click="redirectToLogin">Sign In</UButton>
    </div>

    <!-- Consent -->
    <div v-else-if="status === 'consent' && appInfo" class="flex flex-col items-center gap-4 py-8 w-[80%] mx-auto">
      <UIcon name="i-heroicons-shield-check" class="text-5xl text-primary" />
      <h1 class="text-2xl font-bold text-center">{{ appInfo.app_name }}</h1>
      <p class="text-gray-500 text-center text-sm">wants permission to access your Semi account</p>

      <div class="w-full border border-gray-200 dark:border-gray-700 rounded-xl divide-y divide-gray-200 dark:divide-gray-700 my-2">
        <div
          v-for="scope in appInfo.scopes"
          :key="scope"
          class="flex items-center gap-3 px-4 py-3"
        >
          <UIcon name="i-heroicons-check-circle" class="text-green-500 flex-shrink-0 text-xl" />
          <div>
            <p class="font-medium text-sm">{{ SCOPE_LABELS[scope]?.title ?? scope }}</p>
            <p class="text-xs text-gray-500">{{ SCOPE_LABELS[scope]?.desc ?? '' }}</p>
          </div>
        </div>
      </div>

      <p class="text-xs text-gray-400 text-center">
        By authorizing, you agree to share the listed information with {{ appInfo.app_name }}.
        You can revoke access at any time from your profile settings.
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
          Deny
        </UButton>
        <UButton
          color="primary"
          size="xl"
          class="flex-1"
          :loading="loading"
          @click="onAccept"
        >
          Authorize
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

definePageMeta({ layout: "unauth" })

const route = useRoute()
const router = useRouter()

const status = ref<"loading" | "needs_login" | "consent" | "error">("loading")
const errorMessage = ref("")
const appInfo = ref<{ app_name: string; scopes: string[]; client_id: string } | null>(null)
const oauthParams = ref<OAuthPendingParams | null>(null)
const loading = ref(false)

const SCOPE_LABELS: Record<string, { title: string; desc: string }> = {
  openid: { title: "Verify your identity", desc: "Confirm you are a Semi user" },
  profile: { title: "Profile information", desc: "Your handle and phone/email verification status" },
  wallet: { title: "Wallet address", desc: "Your primary EVM wallet address" },
  "token:read": { title: "Token balances", desc: "View your token and points balances" },
}

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
    errorMessage.value = "Missing OAuth parameters. Please restart the authorization flow."
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
    errorMessage.value = err?.data?.statusMessage || err?.statusMessage || "Invalid authorization request."
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
    errorMessage.value = err?.data?.statusMessage || err?.statusMessage || "Authorization failed."
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
