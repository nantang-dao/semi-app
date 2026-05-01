export default defineEventHandler(async (event) => {
  const authToken = getCookie(event, "semi_auth_token")
  if (!authToken) throw createError({ statusCode: 401, statusMessage: "Not authenticated" })

  const backendUrl = process.env.VITE_API_URL || "https://semi.fly.dev"
  return $fetch(`${backendUrl}/oauth/applications`, {
    headers: { Authorization: `Bearer ${authToken}` },
  })
})
