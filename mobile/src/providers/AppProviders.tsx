import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type PropsWithChildren, useCallback, useEffect, useState } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AppPrivacyShield } from '@/components/AppPrivacyShield'
import { NetworkStatusBanner } from '@/components/NetworkStatusBanner'
import { installNativeQueryStateListeners } from '@/query/nativeState'
import { clearSessionCaches } from '@/session/cleanup'
import { SessionProvider } from '@/session/SessionContext'
import { ReaderPreferencesProvider } from './ReaderPreferencesContext'

export function AppProviders({ children }: PropsWithChildren) {
  useEffect(() => installNativeQueryStateListeners(), [])

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
  const onSessionCleanup = useCallback(
    () => clearSessionCaches(queryClient),
    [queryClient],
  )

  return (
    <SafeAreaProvider>
      <AppPrivacyShield>
        <ReaderPreferencesProvider>
          <QueryClientProvider client={queryClient}>
            <SessionProvider onSessionCleanup={onSessionCleanup}>
              {children}
              <NetworkStatusBanner />
            </SessionProvider>
          </QueryClientProvider>
        </ReaderPreferencesProvider>
      </AppPrivacyShield>
    </SafeAreaProvider>
  )
}
