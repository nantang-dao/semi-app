// Proxy POST /api/oauth/authorize → backend POST /oauth/authorize
// Forwards the user's semi_auth_token as Authorization header.
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const authToken = getCookie(event, "semi_auth_token")
  const backendUrl = process.env.NUXT_PUBLIC_API_URL || "https://semi.fly.dev"

  if (!authToken) {
    throw createError({ statusCode: 401, statusMessage: "Not authenticated" })
  }

  try {
    const response = await $fetch(`${backendUrl}/oauth/authorize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(body),
    })
    return response
  } catch (err: any) {
    const status = err?.response?.status || 400
    const message = err?.data?.message || err?.message || "Authorization failed"
    throw createError({ statusCode: status, statusMessage: message })
  }
})
