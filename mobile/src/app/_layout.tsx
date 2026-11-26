import { type ErrorBoundaryProps, router, Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { RouteErrorFallback } from '@/components/RouteErrorFallback'
import { AppProviders } from '@/providers/AppProviders'
import { colors } from '@/theme/colors'

export default function RootLayout() {
  return (
    <AppProviders>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </AppProviders>
  )
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <RouteErrorFallback
      error={error}
      leaveLabel="返回首页"
      message="你可以重试，或返回首页继续使用。"
      onLeave={() => router.replace('/')}
      retry={retry}
      title="应用遇到问题"
    />
  )
}
