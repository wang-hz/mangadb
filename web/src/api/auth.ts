import type { LoginLog, PageResult, User } from '../types'
import { request } from './request'

export async function checkSetupStatus(): Promise<{ needsSetup: boolean }> {
  const res = await fetch('/api/auth/setup-status')
  return res.json()
}

export async function setupFirstAdmin(username: string, password: string): Promise<User> {
  const res = await fetch('/api/auth/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text)
  }
  return res.json()
}

export async function login(username: string, password: string): Promise<{ token: string }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Invalid credentials')
  return res.json()
}

export function getUsers(): Promise<User[]> {
  return request<User[]>('/api/auth/users')
}

export function createUser(username: string, password: string, role: string): Promise<User> {
  return request<User>('/api/auth/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, role }),
  })
}

export function deleteUser(uuid: string): Promise<void> {
  return request<void>(`/api/auth/users/${uuid}`, { method: 'DELETE' })
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
}

export function changePassword(uuid: string, newPassword: string, currentPassword?: string): Promise<void> {
  return request<void>(`/api/auth/users/${uuid}/password`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword, ...(currentPassword !== undefined ? { currentPassword } : {}) }),
  })
}

export function getLoginLogs(params: { page: number; limit: number; username?: string; success?: boolean }): Promise<PageResult<LoginLog>> {
  const q = new URLSearchParams({ page: String(params.page), limit: String(params.limit) })
  if (params.username) q.set('username', params.username)
  if (params.success !== undefined) q.set('success', String(params.success))
  return request<PageResult<LoginLog>>(`/api/auth/login-logs?${q}`)
}