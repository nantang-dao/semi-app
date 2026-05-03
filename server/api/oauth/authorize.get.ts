// Proxy GET /api/oauth/authorize → backend GET /oauth/authorize
// Returns app info JSON for the consent page to render.
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const backendUrl = getBackendUrl()

  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v != null) params.set(k, Array.isArray(v) ? v[0] : String(v))
  }

  try {
    const response = await $fetch(`${backendUrl}/oauth/authorize?${params.toString()}`, {
      method: "GET",
    })
    return response
  } catch (err: any) {
    const status = err?.response?.status || 400
    const message = err?.data?.message || err?.message || "Invalid authorization request"
    throw createError({ statusCode: status, statusMessage: message })
  }
})
