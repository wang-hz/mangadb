import { useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Redirect, router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { login } from '@/api/auth'
import { ApiError } from '@/api/client'
import { CenteredState } from '@/components/CenteredState'
import { PrimaryButton } from '@/components/PrimaryButton'
import { useSession } from '@/session/SessionContext'
import { colors } from '@/theme/colors'

export default function LoginScreen() {
  const session = useSession()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (session.status === 'loading') return <CenteredState title="正在读取会话" loading />
  if (session.status === 'needs-server') return <Redirect href="/connect" />
  if (session.status === 'authenticated') return <Redirect href="/(app)/(tabs)/mangas" />

  const submit = async () => {
    const trimmedUsername = username.trim()
    if (!trimmedUsername) {
      setError('请输入用户名')
      return
    }
    if (password.length < 8) {
      setError('密码至少需要 8 个字符')
      return
    }
    if (!session.api) return

    setSubmitting(true)
    setError(null)
    try {
      const response = await login(session.api, trimmedUsername, password)
      await session.authenticate(response.token)
      router.replace('/(app)/(tabs)/mangas')
    } catch (loginError) {
      setError(loginMessage(loginError))
    } finally {
      setSubmitting(false)
    }
  }

  const changeServer = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const result = await session.clearServer()
      if (!result.cacheCleared) {
        Alert.alert(
          '本机缓存未完全清理',
          '服务器配置已经清除，但部分查询或图片缓存未能清理。下次退出时会再次尝试。',
        )
      }
      router.replace('/connect')
    } catch {
      setError('无法清除本机服务器配置，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.brandBlock}>
            <Text style={styles.brand}>登录 MangaDB</Text>
            <Text numberOfLines={2} style={styles.server}>{session.serverUrl}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>用户名</Text>
            <TextInput
              accessibilityLabel="用户名"
              autoCapitalize="none"
              autoComplete="username"
              autoCorrect={false}
              editable={!submitting}
              onChangeText={value => {
                setUsername(value)
                setError(null)
              }}
              placeholder="请输入用户名"
              placeholderTextColor={colors.muted}
              returnKeyType="next"
              style={styles.input}
              value={username}
            />

            <Text style={styles.label}>密码</Text>
            <TextInput
              accessibilityLabel="密码"
              autoCapitalize="none"
              autoComplete="password"
              editable={!submitting}
              onChangeText={value => {
                setPassword(value)
                setError(null)
              }}
              onSubmitEditing={() => { void submit() }}
              placeholder="请输入密码"
              placeholderTextColor={colors.muted}
              returnKeyType="done"
              secureTextEntry
              style={styles.input}
              value={password}
            />

            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <PrimaryButton loading={submitting} onPress={() => { void submit() }}>
              登录
            </PrimaryButton>
            <PrimaryButton
              disabled={submitting}
              onPress={() => { void changeServer() }}
              variant="secondary"
            >
              更换服务器
            </PrimaryButton>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function loginMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400 || error.status === 401) return '用户名或密码不正确'
    if (error.status === 429) return '登录尝试次数过多，请稍后再试'
    if (error.status === 403) return '此账号没有访问权限'
    return error.message
  }
  return error instanceof Error ? error.message : '登录失败，请重试'
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: {
    flex: 1,
    backgroundColor: colors.header,
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: 24,
    padding: 24,
  },
  brandBlock: {
    alignItems: 'center',
    gap: 8,
  },
  brand: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '800',
  },
  server: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13,
    textAlign: 'center',
  },
  card: {
    gap: 12,
    padding: 20,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  label: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  input: {
    minHeight: 50,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    color: colors.text,
    fontSize: 16,
    backgroundColor: colors.surface,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
})
