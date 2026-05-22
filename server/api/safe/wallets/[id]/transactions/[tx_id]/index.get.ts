export default defineEventHandler(async (event) => {
  const authToken = getCookie(event, "semi_auth_token")
  if (!authToken) throw createError({ statusCode: 401, statusMessage: "Not authenticated" })
  const id = getRouterParam(event, "id")
  const tx_id = getRouterParam(event, "tx_id")
  const backendUrl = getBackendUrl()
  return $fetch(`${backendUrl}/safe/wallets/${id}/transactions/${tx_id}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  })
})
