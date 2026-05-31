export default defineEventHandler(async (event) => {
  const authToken = getCookie(event, "semi_auth_token")
  if (!authToken) throw createError({ statusCode: 401, statusMessage: "Not authenticated" })
  const id = getRouterParam(event, "id")
  const query = getQuery(event)
  const backendUrl = getBackendUrl()
  return backendFetch(`${backendUrl}/safe/wallets/${id}/transactions`, {
    headers: { Authorization: `Bearer ${authToken}` },
    query,
  })
})
