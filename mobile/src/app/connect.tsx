import { useEffect, useState } from 'react'
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
import { router } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { SafeAreaView } from 'react-native-safe-area-context'
import { checkServer } from '@/api/auth'
import { ApiClient, ApiError } from '@/api/client'
import { PrimaryButton } from '@/components/PrimaryButton'
import { useSession } from '@/session/SessionContext'
import { validateServerUrl } from '@/server/serverUrl'
import { colors } from '@/theme/colors'

export default function ConnectScreen() {
  const { serverUrl, configureServer } = useSession()
  const [address, setAddress] = useState(serverUrl ?? '')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (serverUrl) setAddress(serverUrl)
  }, [serverUrl])

  const connect = async () => {
    setError(null)
    let candidate
    try {
      candidate = validateServerUrl(address)
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : '服务器地址无效')
      return
    }

    if (candidate.requiresCleartextConfirmation && !await confirmCleartextConnection()) return

    setChecking(true)
    try {
      const setupStatus = await checkServer(new ApiClient(candidate.url))
      if (setupStatus.needsSetup) {
        showSetupRequired(candidate.url)
        return
      }
      await configureServer(candidate.url)
      router.replace('/login')
    } catch (connectionError) {
      setError(connectionMessage(connectionError))
    } finally {
      setChecking(false)
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brandBlock}>
            <Text style={styles.brand}>MangaDB</Text>
            <Text style={styles.brandSubtitle}>连接你的漫画服务器</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>服务器地址</Text>
            <TextInput
              accessibilityLabel="服务器地址"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!checking}
              keyboardType="url"
              onChangeText={value => {
                setAddress(value)
                setError(null)
              }}
              onSubmitEditing={() => { void connect() }}
              placeholder="http://192.168.1.10:3000"
              placeholderTextColor={colors.muted}
              returnKeyType="go"
              style={[styles.input, error ? styles.inputError : null]}
              value={address}
            />
            <Text style={styles.help}>
              公网服务器必须使用可信 HTTPS；局域网 HTTP 连接会在确认风险后启用。
            </Text>
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <PrimaryButton
              disabled={!address.trim()}
              loading={checking}
              onPress={() => { void connect() }}
            >
              检查并连接
            </PrimaryButton>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function confirmCleartextConnection(): Promise<boolean> {
  return new Promise(resolve => {
    let resolved = false
    const finish = (value: boolean) => {
      if (resolved) return
      resolved = true
      resolve(value)
    }
    Alert.alert(
      '确认明文连接',
      'HTTP 不会加密账号、密码和漫画内容。请仅在可信局域网中继续。',
      [
        { text: '取消', style: 'cancel', onPress: () => finish(false) },
        { text: '继续连接', style: 'destructive', onPress: () => finish(true) },
      ],
      { cancelable: true, onDismiss: () => finish(false) },
    )
  })
}

function showSetupRequired(serverUrl: string) {
  Alert.alert(
    '服务器尚未初始化',
    '请先在浏览器中创建管理员账号，然后返回重新连接。',
    [
      { text: '稍后处理', style: 'cancel' },
      {
        text: '打开初始化页面',
        onPress: () => { void WebBrowser.openBrowserAsync(`${serverUrl}/setup`) },
      },
    ],
  )
}

function connectionMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return '该地址不是兼容的 MangaDB 服务器'
    if (error.status === 429) return '检查次数过多，请稍后再试'
    return error.message
  }
  return error instanceof Error ? error.message : '连接服务器失败'
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
    gap: 28,
    padding: 24,
  },
  brandBlock: {
    alignItems: 'center',
    gap: 6,
  },
  brand: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '800',
  },
  brandSubtitle: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 16,
  },
  card: {
    gap: 14,
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
  inputError: {
    borderColor: colors.danger,
  },
  help: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
})
