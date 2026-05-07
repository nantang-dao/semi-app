// Proxy GET /api/oauth/grants → backend GET /oauth/grants
export default defineEventHandler(async (event) => {
  const backendUrl = process.env.VITE_API_URL || "https://semi.fly.dev"

  try {
    const response = await $fetch(`${backendUrl}/oauth/grants`, {
      method: "GET",
      headers: {
        Authorization: getHeader(event, "authorization") || ""
      }
    })
    return response
  } catch (err: any) {
    const status = err?.response?.status || 400
    const message = err?.data?.statusMessage || err?.message || "Failed to fetch grants"
    throw createError({ statusCode: status, statusMessage: message })
  }
})
