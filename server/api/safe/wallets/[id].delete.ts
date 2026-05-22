export default defineEventHandler(async (event) => {
  const authToken = getCookie(event, "semi_auth_token")
  if (!authToken) throw createError({ statusCode: 401, statusMessage: "Not authenticated" })
  const id = getRouterParam(event, "id")
  const backendUrl = getBackendUrl()
  return $fetch(`${backendUrl}/safe/wallets/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${authToken}` },
  })
})
