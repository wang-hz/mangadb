import { QueryClientProvider } from '@tanstack/react-query'
import { type PropsWithChildren, useCallback, useEffect, useState } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AppPrivacyShield } from '@/components/AppPrivacyShield'
import { NetworkStatusBanner } from '@/components/NetworkStatusBanner'
import { DownloadProvider } from '@/downloads/DownloadContext'
import { stopActiveDownloadQueue } from '@/downloads/registry'
import { createMobileQueryClient } from '@/query/client'
import { installNativeQueryStateListeners } from '@/query/nativeState'
import {
  configureImageCache,
  installImageCacheLifecycle,
} from '@/media/cacheLifecycle'
import { clearSessionCaches } from '@/session/cleanup'
import { SessionProvider } from '@/session/SessionContext'
import { ReaderPreferencesProvider } from './ReaderPreferencesContext'

export function AppProviders({ children }: PropsWithChildren) {
  useState(() => {
    configureImageCache()
    return true
  })
  useEffect(() => installNativeQueryStateListeners(), [])
  useEffect(() => installImageCacheLifecycle(), [])

  const [queryClient] = useState(createMobileQueryClient)
  const onSessionCleanup = useCallback(async () => {
    await stopActiveDownloadQueue()
    return clearSessionCaches(queryClient)
  }, [queryClient])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
    </GestureHandlerRootView>
  )
}
