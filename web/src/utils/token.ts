const KEY = 'mangadb_token'

export function getToken() {
  return localStorage.getItem(KEY)
}

export function setToken(token: string) {
  localStorage.setItem(KEY, token)
}

export function removeToken() {
  localStorage.removeItem(KEY)
}

function decodePayload(token: string): Record<string, string> | null {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return null
  }
}

export function getRole(): string | null {
  const token = getToken()
  return token ? (decodePayload(token)?.role ?? null) : null
}

export function getUsername(): string | null {
  const token = getToken()
  return token ? (decodePayload(token)?.sub ?? null) : null
}

export function getUuid(): string | null {
  const token = getToken()
  return token ? (decodePayload(token)?.uuid ?? null) : null
}