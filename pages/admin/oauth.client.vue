<template>
  <div class="container mx-auto px-4 py-8">
    <h1 class="text-3xl font-bold mb-6">OAuth Applications (Admin)</h1>

    <UCard>
      <div v-if="loading" class="flex justify-center py-8">
        <UIcon name="i-heroicons-arrow-path" class="animate-spin text-4xl text-primary" />
      </div>

      <div v-else-if="error" class="text-red-500 py-4">
        Error: {{ error }}
      </div>

      <div v-else-if="applications.length === 0" class="text-gray-500 py-4">
        No OAuth applications registered
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="border-b">
            <tr>
              <th class="text-left py-2 px-4">App Name</th>
              <th class="text-left py-2 px-4">Client ID</th>
              <th class="text-left py-2 px-4">Owner</th>
              <th class="text-left py-2 px-4">Status</th>
              <th class="text-left py-2 px-4">Scopes</th>
              <th class="text-left py-2 px-4">Created</th>
              <th class="text-left py-2 px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="app in applications" :key="app.id" class="border-b hover:bg-gray-50">
              <td class="py-3 px-4 font-medium">{{ app.name }}</td>
              <td class="py-3 px-4 font-mono text-xs">{{ app.client_id }}</td>
              <td class="py-3 px-4">
                <span class="text-gray-600">{{ app.owner_handle || app.owner_id }}</span>
              </td>
              <td class="py-3 px-4">
                <UBadge
                  :color="app.status === 'active' ? 'green' : app.status === 'draft' ? 'yellow' : 'red'"
                  :label="app.status"
                />
              </td>
              <td class="py-3 px-4">
                <div class="flex flex-wrap gap-1">
                  <UBadge v-for="scope in app.allowed_scopes" :key="scope" variant="outline" :label="scope" size="sm" />
                </div>
              </td>
              <td class="py-3 px-4 text-xs text-gray-500">
                {{ formatDate(app.created_at) }}
              </td>
              <td class="py-3 px-4">
                <UButton
                  icon="i-heroicons-eye"
                  color="gray"
                  variant="ghost"
                  size="sm"
                  @click="viewDetails(app)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <!-- Details Modal -->
    <UModal v-model="showDetailsModal">
      <UCard v-if="selectedApp" class="w-full">
        <template #header>
          <h2 class="text-xl font-bold">{{ selectedApp.name }}</h2>
        </template>

        <div class="space-y-4">
          <div>
            <h3 class="font-semibold text-sm text-gray-600 mb-1">Client ID</h3>
            <code class="block bg-gray-100 p-2 rounded text-xs break-all">{{ selectedApp.client_id }}</code>
          </div>

          <div>
            <h3 class="font-semibold text-sm text-gray-600 mb-1">Owner</h3>
            <p>{{ selectedApp.owner_handle || selectedApp.owner_id }}</p>
          </div>

          <div>
            <h3 class="font-semibold text-sm text-gray-600 mb-1">Status</h3>
            <UBadge
              :color="selectedApp.status === 'active' ? 'green' : selectedApp.status === 'draft' ? 'yellow' : 'red'"
              :label="selectedApp.status"
            />
          </div>

          <div>
            <h3 class="font-semibold text-sm text-gray-600 mb-1">Allowed Scopes</h3>
            <div class="flex flex-wrap gap-2">
              <UBadge v-for="scope in selectedApp.allowed_scopes" :key="scope" :label="scope" />
            </div>
          </div>

          <div>
            <h3 class="font-semibold text-sm text-gray-600 mb-1">Redirect URIs</h3>
            <ul class="list-disc list-inside space-y-1">
              <li v-for="uri in selectedApp.redirect_uris" :key="uri" class="text-sm break-all">
                {{ uri }}
              </li>
            </ul>
          </div>

          <div>
            <h3 class="font-semibold text-sm text-gray-600 mb-1">Created</h3>
            <p class="text-sm">{{ formatDate(selectedApp.created_at) }}</p>
          </div>
        </div>

        <template #footer>
          <UButton color="gray" @click="showDetailsModal = false">Close</UButton>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

<script setup lang="ts">
const loading = ref(true)
const error = ref("")
const applications = ref<any[]>([])
const showDetailsModal = ref(false)
const selectedApp = ref<any>(null)

onMounted(async () => {
  try {
    const result = await $fetch("/api/oauth/admin/applications")
    applications.value = result.applications || []
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.message || "Failed to fetch applications"
  } finally {
    loading.value = false
  }
})

function viewDetails(app: any) {
  selectedApp.value = app
  showDetailsModal.value = true
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString()
}
</script>
