<template>
  <div class="container mx-auto px-4 py-8">
    <h1 class="text-3xl font-bold mb-6">Authorized Applications</h1>

    <UCard>
      <div v-if="loading" class="flex justify-center py-8">
        <UIcon name="i-heroicons-arrow-path" class="animate-spin text-4xl text-primary" />
      </div>

      <div v-else-if="error" class="text-red-500 py-4">
        Error: {{ error }}
      </div>

      <div v-else-if="grants.length === 0" class="text-gray-500 py-4">
        You haven't authorized any OAuth applications yet.
      </div>

      <div v-else class="space-y-4">
        <div
          v-for="grant in grants"
          :key="grant.id"
          class="border rounded-lg p-4 hover:bg-gray-50 flex justify-between items-start"
        >
          <div class="flex-1">
            <h3 class="text-lg font-semibold mb-2">{{ grant.app_name }}</h3>
            <div class="space-y-1 text-sm text-gray-600">
              <p>
                <span class="font-medium">Client ID:</span>
                <code class="bg-gray-100 px-2 py-1 rounded text-xs font-mono">{{ grant.client_id }}</code>
              </p>
              <p>
                <span class="font-medium">Authorized:</span>
                {{ formatDate(grant.created_at) }}
              </p>
              <div v-if="grant.scopes && grant.scopes.length > 0">
                <span class="font-medium block mb-1">Permissions:</span>
                <div class="flex flex-wrap gap-1">
                  <UBadge
                    v-for="scope in grant.scopes"
                    :key="scope"
                    variant="outline"
                    :label="scope"
                    size="sm"
                  />
                </div>
              </div>
            </div>
          </div>
          <UButton
            icon="i-heroicons-trash-20-solid"
            color="red"
            variant="ghost"
            @click="revokeGrant(grant.id)"
            :loading="revoking === grant.id"
          >
            Revoke
          </UButton>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
const loading = ref(true)
const error = ref("")
const grants = ref<any[]>([])
const revoking = ref<string | null>(null)

onMounted(async () => {
  await fetchGrants()
})

async function fetchGrants() {
  try {
    loading.value = true
    error.value = ""
    const result = await $fetch("/api/oauth/grants")
    grants.value = result.grants || []
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.message || "Failed to fetch grants"
  } finally {
    loading.value = false
  }
}

async function revokeGrant(grantId: string) {
  if (!confirm("Are you sure you want to revoke this authorization?")) {
    return
  }

  try {
    revoking.value = grantId
    await $fetch(`/api/oauth/grants/${grantId}`, {
      method: "DELETE"
    })
    grants.value = grants.value.filter(g => g.id !== grantId)
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.message || "Failed to revoke grant"
  } finally {
    revoking.value = null
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString()
}
</script>
