import { QueryClient } from '@tanstack/react-query'

export function createMobileQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        networkMode: 'online',
        refetchOnReconnect: true,
        refetchOnWindowFocus: true,
        staleTime: 30_000,
        retry: shouldRetryQuery,
      },
    },
  })
}

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (typeof error === 'object' && error && 'status' in error) {
    const status = Number(error.status)
    if (status >= 400 && status < 500) return false
  }
  return failureCount < 2
}
