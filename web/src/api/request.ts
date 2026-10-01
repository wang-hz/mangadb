import { clearSession, getUuid } from '../utils/token'

export async function request<T>(url: string, options?: RequestInit, expectedUser?: string): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include' })
  if (expectedUser && getUuid() !== expectedUser) throw new Error('Session changed')
  if (res.status === 401) {
    clearSession()
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status}: ${text}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}