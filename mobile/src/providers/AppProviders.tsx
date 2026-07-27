import { QueryClientProvider } from '@tanstack/react-query'
import { type PropsWithChildren, useCallback, useEffect, useState } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AppPrivacyShield } from '@/components/AppPrivacyShield'
import { NetworkStatusBanner } from '@/components/NetworkStatusBanner'
import { DownloadProvider } from '@/downloads/DownloadContext'
import { stopActiveDownloadQueue } from '@/downloads/registry'
import { createMobileQueryClient } from '@/query/client'
import { installNativeQueryStateListeners } from '@/query/nativeState'
import { clearSessionCaches } from '@/session/cleanup'
import { SessionProvider } from '@/session/SessionContext'
import { ReaderPreferencesProvider } from './ReaderPreferencesContext'

export function AppProviders({ children }: PropsWithChildren) {
  useEffect(() => installNativeQueryStateListeners(), [])

  const [queryClient] = useState(createMobileQueryClient)
  const onSessionCleanup = useCallback(async () => {
    await stopActiveDownloadQueue()
    return clearSessionCaches(queryClient)
  }, [queryClient])

  return (
    <SafeAreaProvider>
      <AppPrivacyShield>
        <ReaderPreferencesProvider>
          <QueryClientProvider client={queryClient}>
            <SessionProvider onSessionCleanup={onSessionCleanup}>
              <DownloadProvider>
                {children}
                <NetworkStatusBanner />
              </DownloadProvider>
            </SessionProvider>
          </QueryClientProvider>
        </ReaderPreferencesProvider>
      </AppPrivacyShield>
    </SafeAreaProvider>
  )
}
