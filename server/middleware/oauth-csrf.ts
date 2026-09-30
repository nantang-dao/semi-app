/**
 * /api/oauth/** 靠登录 cookie 认人（authorize.post 会直接批准授权），所以会改状态的请求
 * 必须来自本站：
 * - Sec-Fetch-Site / Origin 表明是跨站发起的，拒绝；
 * - POST / PATCH / PUT 必须是 JSON。HTML 表单发不出 JSON，跨站 fetch 发 JSON 要过
 *   CORS 预检，而这里不响应预检。
 * 曾经没有这层，cookie 也没有 SameSite：别的网站提交一个表单就能替用户批准攻击者的
 * OAuth 应用。页面自己的请求（$fetch + 对象 body）都是同源 JSON，不受影响。
 */
export default defineEventHandler((event) => {
  if (!event.path.startsWith("/api/oauth/")) return
  const method = event.method.toUpperCase()
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return

  const site = getRequestHeader(event, "sec-fetch-site")
  if (site && site !== "same-origin" && site !== "none") {
    throw createError({ statusCode: 403, statusMessage: "Cross-site request refused" })
  }

  const origin = getRequestHeader(event, "origin")
  if (origin) {
    let originHost = ""
    try {
      originHost = new URL(origin).host
    } catch {}
    if (originHost !== getRequestHost(event, { xForwardedHost: true })) {
      throw createError({ statusCode: 403, statusMessage: "Cross-site request refused" })
    }
  }

  if (["POST", "PATCH", "PUT"].includes(method)) {
    const type = getRequestHeader(event, "content-type") || ""
    if (!type.toLowerCase().startsWith("application/json")) {
      throw createError({ statusCode: 415, statusMessage: "JSON body required" })
    }
  }
})
