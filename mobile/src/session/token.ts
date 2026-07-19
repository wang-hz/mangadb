import { jwtDecode } from 'jwt-decode'
import type { SessionUser } from '@/api/types'

interface MangaDbTokenPayload {
  sub?: unknown
  uuid?: unknown
  role?: unknown
  exp?: unknown
}

export function userFromToken(token: string, now = Date.now()): SessionUser | null {
  try {
    const payload = jwtDecode<MangaDbTokenPayload>(token)
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.uuid !== 'string' ||
      typeof payload.role !== 'string' ||
      typeof payload.exp !== 'number'
    ) {
      return null
    }
    const expiresAt = payload.exp * 1000
    if (expiresAt <= now) return null
    return {
      uuid: payload.uuid,
      username: payload.sub,
      role: payload.role,
      expiresAt,
    }
  } catch {
    return null
  }
}
