<template>
  <div class="flex flex-col container-size rounded-xl bg-[var(--ui-bg)] shadow-lg p-4">
    <UButton icon="i-heroicons-arrow-left" color="neutral" variant="ghost" class="self-start mb-4"
      @click="router.push('/')">
      返回
    </UButton>

    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold">OAuth 应用</h1>
      <UButton icon="i-heroicons-plus" color="primary" size="sm" @click="openCreateModal">
        注册应用
      </UButton>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex flex-col gap-3">
      <div v-for="i in 2" :key="i" class="w-full h-24 rounded-xl loading-bg" />
    </div>

    <!-- Empty -->
    <div v-else-if="apps.length === 0"
      class="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
      <UIcon name="i-heroicons-code-bracket-square" class="text-5xl" />
      <p class="text-sm">还没有 OAuth 应用</p>
      <UButton color="primary" variant="outline" size="sm" @click="openCreateModal">注册第一个应用</UButton>
    </div>

    <!-- App list -->
    <div v-else class="flex flex-col gap-3">
      <div v-for="app in apps" :key="app.id"
        class="border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-col gap-3">
        <div class="flex items-start justify-between gap-2">
          <div class="flex flex-col gap-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-semibold truncate">{{ app.name }}</span>
              <UBadge :color="statusColor(app.status)" variant="subtle" size="xs">
                {{ statusLabel(app.status) }}
              </UBadge>
            </div>
            <code class="text-xs text-gray-400 break-all">{{ app.client_id }}</code>
          </div>
          <div class="flex gap-1 flex-shrink-0">
            <UButton icon="i-heroicons-pencil-square" color="neutral" variant="ghost" size="xs"
              @click="openEditModal(app)" />
            <UButton icon="i-heroicons-trash" color="red" variant="ghost" size="xs"
              @click="confirmDelete(app)" />
          </div>
        </div>

        <div class="flex flex-wrap gap-1">
          <UBadge v-for="scope in app.allowed_scopes" :key="scope" color="primary" variant="outline" size="xs">
            {{ scope }}
          </UBadge>
        </div>

        <div class="text-xs text-gray-400 flex flex-col gap-0.5">
          <div v-for="uri in app.redirect_uris" :key="uri" class="truncate">
            <UIcon name="i-heroicons-arrow-turn-down-right" class="inline mr-1" />{{ uri }}
          </div>
        </div>
      </div>
    </div>

    <!-- Create / Edit Modal -->
    <UModal v-model:open="showFormModal" :title="editingApp ? '编辑应用' : '注册 OAuth 应用'"
      :ui="{ content: 'max-w-md' }">
      <template #body>
        <div class="flex flex-col gap-4 p-1">
          <UFormField label="应用名称" required>
            <UInput v-model="form.name" placeholder="我的应用" class="w-full" variant="subtle" />
          </UFormField>

          <UFormField label="Redirect URIs" description="每行一个回调地址" required>
            <UTextarea v-model="form.redirectUrisText" placeholder="https://myapp.com/callback" :rows="3"
              class="w-full" variant="subtle" />
          </UFormField>

          <UFormField label="权限范围">
            <div class="flex flex-wrap gap-2 mt-1">
              <label v-for="scope in VALID_SCOPES" :key="scope"
                class="flex items-center gap-1.5 text-sm cursor-pointer">
                <UCheckbox :model-value="form.scopes.includes(scope)"
                  @update:model-value="toggleScope(scope)" />
                <code>{{ scope }}</code>
              </label>
            </div>
          </UFormField>

          <UFormField v-if="editingApp" label="状态">
            <USelect v-model="form.status" :items="statusOptions" class="w-full" variant="subtle" />
          </UFormField>
        </div>
      </template>

      <template #footer>
        <div class="flex gap-3 justify-end w-full">
          <UButton color="neutral" variant="outline" @click="showFormModal = false">取消</UButton>
          <UButton color="primary" :loading="saving" @click="saveApp">
            {{ editingApp ? '保存' : '创建' }}
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Secret reveal Modal (shown once after creation) -->
    <UModal v-model:open="showSecretModal" title="应用已创建" :ui="{ content: 'max-w-md' }"
      :close="false">
      <template #body>
        <div class="flex flex-col gap-4 p-1">
          <UAlert color="warning" icon="i-heroicons-exclamation-triangle" title="请立即复制 Client Secret">
            <template #description>
              此密钥只显示一次，关闭后无法再次查看。
            </template>
          </UAlert>
          <div>
            <p class="text-xs text-gray-400 mb-1">Client ID</p>
            <div class="flex items-center gap-2">
              <code class="text-xs bg-gray-100 dark:bg-gray-800 rounded px-2 py-1 flex-1 break-all">
                {{ newAppCredentials.client_id }}
              </code>
              <UButton icon="i-heroicons-clipboard" color="neutral" variant="ghost" size="xs"
                @click="copy(newAppCredentials.client_id)" />
            </div>
          </div>
          <div>
            <p class="text-xs text-gray-400 mb-1">Client Secret</p>
            <div class="flex items-center gap-2">
              <code class="text-xs bg-gray-100 dark:bg-gray-800 rounded px-2 py-1 flex-1 break-all">
                {{ newAppCredentials.client_secret }}
              </code>
              <UButton icon="i-heroicons-clipboard" color="neutral" variant="ghost" size="xs"
                @click="copy(newAppCredentials.client_secret)" />
            </div>
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end w-full">
          <UButton color="primary" @click="showSecretModal = false">我已保存，关闭</UButton>
        </div>
      </template>
    </UModal>

    <!-- Delete confirm Modal -->
    <UModal v-model:open="showDeleteModal" title="删除应用" :ui="{ content: 'max-w-sm' }">
      <template #body>
        <p class="text-sm text-gray-500 p-1">
          确认删除 <strong>{{ deletingApp?.name }}</strong>？该应用的所有授权令牌将同时失效，此操作不可恢复。
        </p>
      </template>
      <template #footer>
        <div class="flex gap-3 justify-end w-full">
          <UButton color="neutral" variant="outline" @click="showDeleteModal = false">取消</UButton>
          <UButton color="red" :loading="deleting" @click="deleteApp">删除</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: "default" })

const router = useRouter()
const toast = useToast()

const VALID_SCOPES = ["openid", "profile", "wallet", "token:read"]

const statusOptions = [
  { label: "草稿", value: "draft" },
  { label: "已上线", value: "active" },
  { label: "已禁用", value: "disabled" },
]

interface OAuthApp {
  id: number
  client_id: string
  name: string
  redirect_uris: string[]
  allowed_scopes: string[]
  status: string
  created_at: string
}

// ── State ──────────────────────────────────────────────────────────────
const loading = ref(true)
const apps = ref<OAuthApp[]>([])

const showFormModal = ref(false)
const saving = ref(false)
const editingApp = ref<OAuthApp | null>(null)
const form = reactive({
  name: "",
  redirectUrisText: "",
  scopes: ["openid", "profile"] as string[],
  status: "draft",
})

const showSecretModal = ref(false)
const newAppCredentials = reactive({ client_id: "", client_secret: "" })

const showDeleteModal = ref(false)
const deleting = ref(false)
const deletingApp = ref<OAuthApp | null>(null)

// ── Load ───────────────────────────────────────────────────────────────
onMounted(fetchApps)

async function fetchApps() {
  loading.value = true
  try {
    const res = await $fetch<{ applications: OAuthApp[] }>("/api/oauth/applications")
    apps.value = res.applications ?? []
  } catch {
    toast.add({ title: "加载失败", color: "error" })
  } finally {
    loading.value = false
  }
}

// ── Create ─────────────────────────────────────────────────────────────
function openCreateModal() {
  editingApp.value = null
  form.name = ""
  form.redirectUrisText = ""
  form.scopes = ["openid", "profile"]
  form.status = "draft"
  showFormModal.value = true
}

// ── Edit ───────────────────────────────────────────────────────────────
function openEditModal(app: OAuthApp) {
  editingApp.value = app
  form.name = app.name
  form.redirectUrisText = app.redirect_uris.join("\n")
  form.scopes = [...app.allowed_scopes]
  form.status = app.status
  showFormModal.value = true
}

function toggleScope(scope: string) {
  const idx = form.scopes.indexOf(scope)
  if (idx === -1) form.scopes.push(scope)
  else form.scopes.splice(idx, 1)
}

async function saveApp() {
  if (!form.name.trim()) {
    toast.add({ title: "请填写应用名称", color: "warning" })
    return
  }
  const redirect_uris = form.redirectUrisText
    .split("\n")
    .map((u) => u.trim())
    .filter(Boolean)
  if (redirect_uris.length === 0) {
    toast.add({ title: "请填写至少一个 Redirect URI", color: "warning" })
    return
  }

  saving.value = true
  try {
    if (editingApp.value) {
      await $fetch(`/api/oauth/applications/${editingApp.value.id}`, {
        method: "PATCH",
        body: { name: form.name, redirect_uris, allowed_scopes: form.scopes, status: form.status },
      })
      toast.add({ title: "已保存", color: "success" })
    } else {
      const res = await $fetch<{ application: OAuthApp; client_secret: string }>(
        "/api/oauth/applications",
        {
          method: "POST",
          body: { name: form.name, redirect_uris, allowed_scopes: form.scopes },
        }
      )
      newAppCredentials.client_id = res.application.client_id
      newAppCredentials.client_secret = res.client_secret
      showSecretModal.value = true
      toast.add({ title: "应用已创建", color: "success" })
    }
    showFormModal.value = false
    await fetchApps()
  } catch (err: any) {
    toast.add({ title: "操作失败", description: err?.data?.message ?? err?.message, color: "error" })
  } finally {
    saving.value = false
  }
}

// ── Delete ─────────────────────────────────────────────────────────────
function confirmDelete(app: OAuthApp) {
  deletingApp.value = app
  showDeleteModal.value = true
}

async function deleteApp() {
  if (!deletingApp.value) return
  deleting.value = true
  try {
    await $fetch(`/api/oauth/applications/${deletingApp.value.id}`, { method: "DELETE" })
    toast.add({ title: "已删除", color: "success" })
    showDeleteModal.value = false
    await fetchApps()
  } catch (err: any) {
    toast.add({ title: "删除失败", description: err?.data?.message, color: "error" })
  } finally {
    deleting.value = false
  }
}

// ── Helpers ────────────────────────────────────────────────────────────
function statusColor(status: string) {
  return { active: "success", draft: "neutral", disabled: "error" }[status] ?? "neutral"
}

function statusLabel(status: string) {
  return { active: "已上线", draft: "草稿", disabled: "已禁用" }[status] ?? status
}

async function copy(text: string) {
  await navigator.clipboard.writeText(text)
  toast.add({ title: "已复制", color: "success" })
}
</script>
