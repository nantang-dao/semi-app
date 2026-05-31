export default defineEventHandler(async (event) => {
  const authToken = getCookie(event, "semi_auth_token")
  if (!authToken) throw createError({ statusCode: 401, statusMessage: "Not authenticated" })
  const id = getRouterParam(event, "id")
  const body = await readBody(event)
  const backendUrl = getBackendUrl()
  return backendFetch(`${backendUrl}/safe/wallets/${id}/transactions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}` },
    body,
  })
})
