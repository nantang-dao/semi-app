// Proxy GET /api/oauth/admin/applications → backend GET /oauth/admin/applications
export default defineEventHandler(async (event) => {
  const backendUrl = process.env.VITE_API_URL || "https://api.semi.im"

  try {
    const response = await $fetch(`${backendUrl}/oauth/admin/applications`, {
      method: "GET",
    })
    return response
  } catch (err: any) {
    const status = err?.response?.status || 400
    const message = err?.data?.statusMessage || err?.message || "Failed to fetch applications"
    throw createError({ statusCode: status, statusMessage: message })
  }
})
