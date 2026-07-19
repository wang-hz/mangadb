import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type PropsWithChildren, useState } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { SessionProvider } from '@/session/SessionContext'

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => {
          if (typeof error === 'object' && error && 'status' in error) {
            const status = Number(error.status)
            if (status >= 400 && status < 500) return false
          }
          return failureCount < 2
        },
      },
    },
  }))

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>{children}</SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}
