// Proxy GET /api/oauth/admin/applications → backend GET /oauth/admin/applications
// 后端只对管理员（ADMIN_USER_IDS）开放，这里转发登录态。
export default defineEventHandler(async (event) => {
  const authToken = getCookie(event, "semi_auth_token")
  if (!authToken) throw createError({ statusCode: 401, statusMessage: "Not authenticated" })

  try {
    return await $fetch(`${getBackendUrl()}/oauth/admin/applications`, {
      method: "GET",
      headers: { Authorization: `Bearer ${authToken}` },
    })
  } catch (err: any) {
    const status = err?.response?.status || 400
    const message = err?.data?.message || err?.message || "Failed to fetch applications"
    throw createError({ statusCode: status, statusMessage: message })
  }
})
