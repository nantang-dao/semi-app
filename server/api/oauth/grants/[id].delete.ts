// Proxy DELETE /api/oauth/grants/:id → backend DELETE /oauth/grants/:id
export default defineEventHandler(async (event) => {
  const backendUrl = process.env.VITE_API_URL || "https://semi.fly.dev"
  const id = getRouterParam(event, "id")

  try {
    const response = await $fetch(`${backendUrl}/oauth/grants/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: getHeader(event, "authorization") || ""
      }
    })
    return response
  } catch (err: any) {
    const status = err?.response?.status || 400
    const message = err?.data?.statusMessage || err?.message || "Failed to revoke grant"
    throw createError({ statusCode: status, statusMessage: message })
  }
})
