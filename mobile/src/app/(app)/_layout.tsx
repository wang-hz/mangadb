import { Redirect, Stack } from 'expo-router'
import { CenteredState } from '@/components/CenteredState'
import { useSession } from '@/session/SessionContext'
import { colors } from '@/theme/colors'

export default function ProtectedLayout() {
  const { status } = useSession()

  if (status === 'loading') return <CenteredState title="正在验证会话" loading />
  if (status === 'needs-server') return <Redirect href="/connect" />
  if (status === 'needs-login') return <Redirect href="/login" />

  return (
    <Stack
      screenOptions={({ route }) => ({
        headerShown: false,
        contentStyle: {
          backgroundColor: route.name === 'reader/[uuid]'
            ? colors.reader
            : colors.background,
        },
      })}
    />
  )
}
