/**
 * OAuth 回调地址的规则，与后端 OauthApplication.redirect_uri_error 一致。
 *
 * 同意页会把浏览器跳到这个地址，所以协议必须是 http(s)：曾经可以登记
 * `javascript:…`，用户点「授权」或「拒绝」就在 semi.im 上执行脚本。
 * 返回 null 表示合法，否则返回给开发者看的原因。
 */
export const MAX_REDIRECT_URIS = 10

export function redirectUriError(uri: string): string | null {
  if (uri.length > 2048) return "地址过长"
  if (/\s/.test(uri)) return "不能包含空白字符"
  let url: URL
  try {
    url = new URL(uri)
  } catch {
    return "不是合法的 URL"
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "必须以 https:// 或 http:// 开头"
  if (!url.hostname) return "缺少域名"
  if (url.username || url.password) return "不能包含账号密码"
  if (uri.includes("#")) return "不能包含 #片段"
  return null
}

/** 同意页跳转前的最后一道检查：只允许跳到 http(s) 地址 */
export function isSafeRedirect(uri: string): boolean {
  try {
    const { protocol } = new URL(uri)
    return protocol === "https:" || protocol === "http:"
  } catch {
    return false
  }
}
