export function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  window.crypto.getRandomValues(array)
  return base64urlEncode(array)
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await window.crypto.subtle.digest("SHA-256", data)
  return base64urlEncode(new Uint8Array(digest))
}

function base64urlEncode(bytes: Uint8Array): string {
  let str = ""
  bytes.forEach((b) => (str += String.fromCharCode(b)))
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

export interface OAuthPendingParams {
  client_id: string
  redirect_uri: string
  scope: string
  state: string
  code_challenge: string
  code_challenge_method: "S256"
  code_verifier: string
  response_type: "code"
}

const STORAGE_KEY = "semi_oauth_pending"

export function saveOAuthParams(params: OAuthPendingParams): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(params))
}

export function loadOAuthParams(): OAuthPendingParams | null {
  const raw = sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as OAuthPendingParams
  } catch {
    return null
  }
}

export function clearOAuthParams(): void {
  sessionStorage.removeItem(STORAGE_KEY)
}
