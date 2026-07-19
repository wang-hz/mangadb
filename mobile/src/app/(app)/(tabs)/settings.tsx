import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { Alert } from 'react-native'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { logout } from '@/api/auth'
import { useSession } from '@/session/SessionContext'
import { colors } from '@/theme/colors'

type PendingAction = 'signout' | 'switch-server' | null

export default function SettingsScreen() {
  const session = useSession()
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [error, setError] = useState<string | null>(null)
  const account = session.auth?.user

  const runAction = async (action: Exclude<PendingAction, null>) => {
    if (pendingAction) return
    const confirmed = action === 'signout'
      ? await confirmAction(
          '退出当前账号？',
          '服务器地址和本机阅读位置将保留。',
          '退出登录',
        )
      : await confirmAction(
          '切换服务器？',
          '将退出当前账号并清除查询与图片缓存；各账号的本机阅读位置仍会保留。',
          '切换服务器',
        )
    if (!confirmed) return

    setPendingAction(action)
    setError(null)
    const authenticatedApi = session.api

    try {
      const result = action === 'signout'
        ? await session.signOut()
        : await session.clearServer()
      if (authenticatedApi) void logout(authenticatedApi).catch(() => {})
      if (!result.cacheCleared) {
        Alert.alert(
          '本机缓存未完全清理',
          '会话信息已经清除，但部分查询或图片缓存未能清理。下次退出时会再次尝试。',
        )
      }
    } catch {
      setPendingAction(null)
      setError(action === 'signout'
        ? '无法删除本机登录凭证，请重试。'
        : '无法清除本机服务器配置，请重试。')
    }
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>当前账号</Text>
        <View style={styles.card}>
          <View style={styles.accountIcon}>
            <Ionicons color={colors.brand} name="person" size={27} />
          </View>
          <View style={styles.accountText}>
            <Text selectable style={styles.primaryValue}>{account?.username ?? '未知账号'}</Text>
            <View style={styles.roleChip}>
              <Text style={styles.roleText}>{roleLabel(account?.role)}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>当前服务器</Text>
        <View style={[styles.card, styles.serverCard]}>
          <Ionicons color={colors.brand} name="server-outline" size={24} />
          <Text selectable style={styles.serverUrl}>{session.serverUrl ?? '未配置'}</Text>
        </View>

        <Text style={styles.sectionTitle}>会话</Text>
        <View style={styles.actionCard}>
          <Text style={styles.explanation}>
            退出或切换服务器会清除登录凭证、查询缓存和图片缓存，不会删除本机阅读位置。
          </Text>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <ActionButton
            disabled={pendingAction !== null}
            icon="log-out-outline"
            label="退出登录"
            loading={pendingAction === 'signout'}
            onPress={() => { void runAction('signout') }}
            tone="brand"
          />
          <ActionButton
            disabled={pendingAction !== null}
            icon="swap-horizontal-outline"
            label="切换服务器"
            loading={pendingAction === 'switch-server'}
            onPress={() => { void runAction('switch-server') }}
            tone="danger"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function ActionButton({
  label,
  icon,
  tone,
  loading,
  disabled,
  onPress,
}: {
  label: string
  icon: keyof typeof Ionicons.glyphMap
  tone: 'brand' | 'danger'
  loading: boolean
  disabled: boolean
  onPress: () => void
}) {
  const color = tone === 'danger' ? colors.danger : colors.brand
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        { borderColor: color },
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      {loading
        ? <ActivityIndicator color={color} />
        : <Ionicons color={color} name={icon} size={21} />}
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </Pressable>
  )
}

function roleLabel(role: string | undefined): string {
  if (role === 'admin') return '管理员'
  if (role === 'user') return '普通用户'
  return role || '未知角色'
}

function confirmAction(title: string, message: string, confirmLabel: string): Promise<boolean> {
  return new Promise(resolve => {
    let resolved = false
    const finish = (value: boolean) => {
      if (resolved) return
      resolved = true
      resolve(value)
    }
    Alert.alert(
      title,
      message,
      [
        { text: '取消', style: 'cancel', onPress: () => finish(false) },
        { text: confirmLabel, style: 'destructive', onPress: () => finish(true) },
      ],
      { cancelable: true, onDismiss: () => finish(false) },
    )
  })
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    gap: 10,
    padding: 16,
    paddingBottom: 32,
  },
  sectionTitle: {
    marginTop: 6,
    marginLeft: 4,
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  card: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  accountIcon: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 25,
    backgroundColor: '#e8f2ff',
  },
  accountText: {
    flex: 1,
    alignItems: 'flex-start',
    gap: 7,
  },
  primaryValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  roleChip: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#e8f2ff',
  },
  roleText: {
    color: '#0958d9',
    fontSize: 12,
    fontWeight: '600',
  },
  serverCard: {
    alignItems: 'flex-start',
    minHeight: 72,
  },
  serverUrl: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    lineHeight: 21,
  },
  actionCard: {
    gap: 12,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  explanation: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
  },
  actionButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.75,
  },
  disabled: {
    opacity: 0.5,
  },
})
