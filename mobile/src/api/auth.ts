import { ApiClient, ApiError } from './client'
import type { HealthResponse, LoginResponse, SetupStatusResponse } from './types'

export async function checkServer(client: ApiClient): Promise<SetupStatusResponse> {
  const health = await client.request<HealthResponse>('/health')
  if (!health || health.status !== 'ok') {
    throw new ApiError('服务器健康检查未通过', 503, health)
  }

  const setupStatus = await client.request<SetupStatusResponse>('/api/auth/setup-status')
  if (!setupStatus || typeof setupStatus.needsSetup !== 'boolean') {
    throw new ApiError('服务器返回了无法识别的初始化状态', 502, setupStatus)
  }
  return setupStatus
}

export async function login(
  client: ApiClient,
  username: string,
  password: string,
): Promise<LoginResponse> {
  const response = await client.request<LoginResponse>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!response || typeof response.token !== 'string' || !response.token) {
    throw new ApiError('服务器未返回有效的登录凭证', 502, response)
  }
  return response
}

export async function logout(client: ApiClient): Promise<void> {
  await client.request<void>('/api/auth/logout', { method: 'POST' })
}
