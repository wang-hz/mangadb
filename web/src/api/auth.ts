import type { User } from '../types'
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