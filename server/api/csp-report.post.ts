// 浏览器按 Content-Security-Policy-Report-Only 上报的违规，只记日志，用来决定强制 CSP 要放行哪些来源。
export default defineEventHandler(async (event) => {
  const body = await readRawBody(event).catch(() => undefined)
  if (body && body.length < 8192) {
    try {
      const report = JSON.parse(body)["csp-report"] ?? {}
      console.warn("[csp-report]", JSON.stringify({
        page: report["document-uri"],
        directive: report["violated-directive"] ?? report["effective-directive"],
        blocked: report["blocked-uri"],
      }))
    } catch {}
  }
  setResponseStatus(event, 204)
  return null
})
