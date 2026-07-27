import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
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
