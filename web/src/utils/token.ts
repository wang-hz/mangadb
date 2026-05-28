const KEY = 'mangadb_session'

type Session = { username: string; role: string; uuid: string }

function decodePayload(token: string): Record<string, string> | null {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return null
  }
}

export function sessionFromToken(token: string): Session | null {
  const p = decodePayload(token)
  if (!p?.sub || !p?.role || !p?.uuid) return null
  return { username: p.sub, role: p.role, uuid: p.uuid }
}

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export function setSession(session: Session) {
  localStorage.setItem(KEY, JSON.stringify(session))
}

export function clearSession() {
  localStorage.removeItem(KEY)
}

export function getRole(): string | null {
  return getSession()?.role ?? null
}

export function getUsername(): string | null {
  return getSession()?.username ?? null
}

export function getUuid(): string | null {
  return getSession()?.uuid ?? null
}