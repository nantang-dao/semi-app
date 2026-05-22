export default defineEventHandler(async (event) => {
  const authToken = getCookie(event, "semi_auth_token")
  if (!authToken) throw createError({ statusCode: 401, statusMessage: "Not authenticated" })
  const id = getRouterParam(event, "id")
  const body = await readBody(event)
  const backendUrl = getBackendUrl()
  return $fetch(`${backendUrl}/safe/wallets/${id}/set_safe_address`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${authToken}` },
    body,
  })
})
