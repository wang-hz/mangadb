import { Ionicons } from '@expo/vector-icons'
import { useEffect, useState } from 'react'
import { Alert, AppState, Share } from 'react-native'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { logout } from '@/api/auth'
import { ReaderPreferencesControls } from '@/components/reader/ReaderPreferencesControls'
import { useDownloads } from '@/downloads/DownloadContext'
import { clearDiagnostics, loadDiagnostics } from '@/diagnostics/localDiagnostics'
import { useSession } from '@/session/SessionContext'
import { colors } from '@/theme/colors'

type PendingAction = 'signout' | 'switch-server' | null
type PendingDownloadAction = 'clear-current' | 'clear-all' | null
type PendingDiagnosticAction = 'share' | 'clear' | null

export default function SettingsScreen() {
  const session = useSession()
  const downloads = useDownloads()
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [pendingDownloadAction, setPendingDownloadAction] =
    useState<PendingDownloadAction>(null)
  const [pendingDiagnosticAction, setPendingDiagnosticAction] =
    useState<PendingDiagnosticAction>(null)
  const [wifiPending, setWifiPending] = useState(false)
  const [diagnosticCount, setDiagnosticCount] = useState(0)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [diagnosticError, setDiagnosticError] = useState<string | null>(null)
  const account = session.auth?.user

  useEffect(() => {
    let active = true
    const refresh = () => {
      void loadDiagnostics().then(records => {
        if (active) setDiagnosticCount(records.length)
      }).catch(() => {
        if (active) setDiagnosticError('无法读取本机诊断记录。')
      })
    }
    refresh()
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') refresh()
    })
    return () => {
      active = false
      subscription.remove()
    }
  }, [])

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
    setSessionError(null)
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
      setSessionError(action === 'signout'
        ? '无法删除本机登录凭证，请重试。'
        : '无法清除本机服务器配置，请重试。')
    }
  }

  const clearDownloads = async (scope: Exclude<PendingDownloadAction, null>) => {
    if (pendingDownloadAction) return
    const confirmed = await confirmAction(
      scope === 'clear-current' ? '删除当前账号的下载？' : '清除全部离线内容？',
      scope === 'clear-current'
        ? '将删除当前服务器和账号的全部离线页面，阅读进度仍会保留。'
        : '将删除本机上所有服务器和账号的离线页面，此操作不可撤销。',
      scope === 'clear-current' ? '删除当前下载' : '清除全部',
    )
    if (!confirmed) return
    setPendingDownloadAction(scope)
    setDownloadError(null)
    try {
      if (scope === 'clear-current') await downloads.clearCurrentDownloads()
      else await downloads.clearAllDownloads()
    } catch {
      setDownloadError(scope === 'clear-current'
        ? '无法删除当前账号的本机下载，请重试。'
        : '无法清除全部离线内容，请重试。')
    } finally {
      setPendingDownloadAction(null)
    }
  }

  const runDiagnosticAction = async (
    action: Exclude<PendingDiagnosticAction, null>,
  ) => {
    if (pendingDiagnosticAction) return
    setPendingDiagnosticAction(action)
    setDiagnosticError(null)
    try {
      if (action === 'clear') {
        await clearDiagnostics()
        setDiagnosticCount(0)
        return
      }
      const records = await loadDiagnostics()
      await Share.share({
        title: 'MangaDB 本机诊断记录',
        message: JSON.stringify({
          schemaVersion: 1,
          generatedAt: new Date().toISOString(),
          records,
        }, null, 2),
      })
      setDiagnosticCount(records.length)
    } catch {
      setDiagnosticError(
        action === 'share' ? '无法分享本机诊断记录。' : '无法清除本机诊断记录。',
      )
    } finally {
      setPendingDiagnosticAction(null)
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

        <Text style={styles.sectionTitle}>阅读设置</Text>
        <View style={styles.preferencesCard}>
          <Text style={styles.explanation}>
            本机所有服务器和账号共用。已读漫画仍优先使用该漫画上次选择的模式。
          </Text>
          <ReaderPreferencesControls />
        </View>

        <Text style={styles.sectionTitle}>下载设置</Text>
        <View style={styles.actionCard}>
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.switchTitle}>仅使用 Wi-Fi 下载</Text>
              <Text style={styles.explanation}>以太网也视为非计费连接。</Text>
            </View>
            <Switch
              accessibilityLabel="仅使用 Wi-Fi 下载"
              disabled={wifiPending}
              onValueChange={value => {
                if (wifiPending) return
                setWifiPending(true)
                setDownloadError(null)
                void downloads.setWifiOnly(value)
                  .catch(() => {
                    setDownloadError('无法保存下载网络设置，请重试。')
                  })
                  .finally(() => setWifiPending(false))
              }}
              trackColor={{ false: '#d1d5db', true: '#91caff' }}
              value={downloads.preferences.wifiOnly}
            />
          </View>
          <View style={styles.storageSummary}>
            <Ionicons color={colors.brand} name="phone-portrait-outline" size={22} />
            <View style={styles.storageText}>
              <Text style={styles.switchTitle}>当前账号离线内容</Text>
              <Text style={styles.explanation}>
                {downloads.snapshot.manifests.length} 本 · {formatBytes(downloads.storageUsageBytes)}
              </Text>
            </View>
          </View>
          <ActionButton
            disabled={
              pendingDownloadAction !== null ||
              downloads.snapshot.manifests.length === 0
            }
            icon="trash-outline"
            label="删除当前账号下载"
            loading={pendingDownloadAction === 'clear-current'}
            onPress={() => { void clearDownloads('clear-current') }}
            tone="danger"
          />
          <ActionButton
            disabled={pendingDownloadAction !== null}
            icon="nuclear-outline"
            label="清除全部离线内容"
            loading={pendingDownloadAction === 'clear-all'}
            onPress={() => { void clearDownloads('clear-all') }}
            tone="danger"
          />
          {downloadError
            ? <Text accessibilityRole="alert" style={styles.error}>{downloadError}</Text>
            : null}
        </View>

        <Text style={styles.sectionTitle}>稳定性诊断</Text>
        <View style={styles.actionCard}>
          <Text style={styles.explanation}>
            本机最多保留 50 条脱敏记录，不包含账号、服务器地址、漫画标识或登录凭证。
          </Text>
          <Text style={styles.explanation}>当前共 {diagnosticCount} 条记录</Text>
          <ActionButton
            disabled={pendingDiagnosticAction !== null}
            icon="share-outline"
            label="分享诊断记录"
            loading={pendingDiagnosticAction === 'share'}
            onPress={() => { void runDiagnosticAction('share') }}
            tone="brand"
          />
          <ActionButton
            disabled={pendingDiagnosticAction !== null}
            icon="trash-bin-outline"
            label="清除诊断记录"
            loading={pendingDiagnosticAction === 'clear'}
            onPress={() => { void runDiagnosticAction('clear') }}
            tone="danger"
          />
          {diagnosticError
            ? <Text accessibilityRole="alert" style={styles.error}>{diagnosticError}</Text>
            : null}
        </View>

        <Text style={styles.sectionTitle}>会话</Text>
        <View style={styles.actionCard}>
          <Text style={styles.explanation}>
            退出或切换服务器会清除登录凭证、查询缓存和图片缓存，不会删除本机阅读位置或离线下载；下载只会对原服务器和账号显示。
          </Text>
          {sessionError
            ? <Text accessibilityRole="alert" style={styles.error}>{sessionError}</Text>
            : null}
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

function formatBytes(bytes: number): string {
  const normalized = Math.max(0, bytes)
  if (normalized < 1024) return `${normalized} B`
  if (normalized < 1024 ** 2) return `${(normalized / 1024).toFixed(1)} KiB`
  if (normalized < 1024 ** 3) return `${(normalized / 1024 ** 2).toFixed(1)} MiB`
  return `${(normalized / 1024 ** 3).toFixed(1)} GiB`
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
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
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
  preferencesCard: {
    gap: 18,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  switchRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  switchText: {
    flex: 1,
    gap: 4,
  },
  switchTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  storageSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  storageText: {
    flex: 1,
    gap: 4,
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
