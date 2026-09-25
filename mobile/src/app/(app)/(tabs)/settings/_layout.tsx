import { Stack } from 'expo-router'
import { colors } from '@/theme/colors'

export default function SettingsLayout() {
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: colors.header }, headerTintColor: '#ffffff' }}>
      <Stack.Screen name="index" options={{ title: '设置' }} />
      <Stack.Screen name="account" options={{ title: '账号与服务器' }} />
      <Stack.Screen name="reading" options={{ title: '阅读设置' }} />
      <Stack.Screen name="downloads" options={{ title: '下载' }} />
      <Stack.Screen name="download-settings" options={{ title: '下载设置' }} />
      <Stack.Screen name="diagnostics" options={{ title: '稳定性诊断' }} />
    </Stack>
  )
}
