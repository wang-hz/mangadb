const DEFAULT_TIMEOUT_MS = 15_000

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface ApiClientOptions {
  token?: string
  timeoutMs?: number
  onUnauthorized?: () => void | Promise<void>
  onReachabilityChange?: (reachable: boolean) => void
}

export class ApiClient {
  private readonly baseUrl: string
  private readonly token?: string
  private readonly timeoutMs: number
  private readonly onUnauthorized?: () => void | Promise<void>
  private readonly onReachabilityChange?: (reachable: boolean) => void

  constructor(serverUrl: string, options: ApiClientOptions = {}) {
    this.baseUrl = serverUrl.replace(/\/+$/, '')
    this.token = options.token
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.onUnauthorized = options.onUnauthorized
    this.onReachabilityChange = options.onReachabilityChange
  }

  url(path: string): string {
    return `${this.baseUrl}/${path.replace(/^\/+/, '')}`
  }

  authorizationHeaders(): Record<string, string> {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {}
  }

  async handleExternalResponse(status: number): Promise<void> {
    this.reportReachability(true)
    if (status !== 401) return
    try {
      await this.onUnauthorized?.()
    } catch {
      // Preserve the native transfer's HTTP status if credential cleanup fails.
    }
  }

  handleExternalNetworkFailure(): void {
    this.reportReachability(false)
  }

  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await this.requestResponse(path, options)
    if (response.status === 204) return undefined as T
    return await response.json() as T
  }

  async requestResponse(path: string, options: RequestInit = {}): Promise<Response> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    const externalSignal = options.signal
    const abortFromExternalSignal = () => controller.abort()
    if (externalSignal?.aborted) controller.abort()
    externalSignal?.addEventListener('abort', abortFromExternalSignal, { once: true })

    const headers = new Headers(options.headers)
    if (!headers.has('Accept')) headers.set('Accept', 'application/json')
    if (this.token) headers.set('Authorization', `Bearer ${this.token}`)

    try {
      const response = await fetch(this.url(path), {
        ...options,
        signal: controller.signal,
        headers,
      })
      this.reportReachability(true)

      if (response.status === 401) {
        try {
          await this.onUnauthorized?.()
        } catch {
          // Preserve the server's 401 even if local credential cleanup fails.
        }
      }

      if (!response.ok) {
        const body = await parseResponseBody(response)
        throw new ApiError(errorMessage(body, response.status), response.status, body)
      }

      return response
    } catch (error) {
      if (error instanceof ApiError) throw error
      if (controller.signal.aborted && !externalSignal?.aborted) {
        this.reportReachability(false)
        throw new ApiError('请求超时，请检查服务器连接', 0)
      }
      if (externalSignal?.aborted) throw error
      this.reportReachability(false)
      throw new ApiError('无法连接服务器，请检查地址和网络', 0, error)
    } finally {
      clearTimeout(timeout)
      externalSignal?.removeEventListener('abort', abortFromExternalSignal)
    }
  }

  private reportReachability(reachable: boolean): void {
    try { this.onReachabilityChange?.(reachable) } catch {}
  }
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    try { return await response.json() } catch { return undefined }
  }
  try { return await response.text() } catch { return undefined }
}

function errorMessage(body: unknown, status: number): string {
  if (typeof body === 'string' && body) return body
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
    return body.error
  }
  return `服务器返回错误（${status}）`
}
