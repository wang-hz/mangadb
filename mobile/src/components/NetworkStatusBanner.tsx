import { onlineManager } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  getServerReachabilitySnapshot,
  subscribeServerReachability,
} from '@/server/reachability'
import { colors } from '@/theme/colors'

export function NetworkStatusBanner() {
  const insets = useSafeAreaInsets()
  const isOnline = useSyncExternalStore(
    onStoreChange => onlineManager.subscribe(onStoreChange),
    () => onlineManager.isOnline(),
    () => true,
  )
  const serverReachability = useSyncExternalStore(
    subscribeServerReachability,
    getServerReachabilitySnapshot,
    getServerReachabilitySnapshot,
  )

  const message = !isOnline
    ? '网络已断开，恢复连接后将自动重试'
    : serverReachability.status === 'unreachable'
      ? '无法连接 MangaDB 服务器，将在网络请求时继续重试'
      : null
  if (!message) return null

  return (
    <View
      accessibilityLiveRegion="assertive"
      accessibilityRole="alert"
      pointerEvents="none"
      style={[
        styles.banner,
        serverReachability.status === 'unreachable' && isOnline ? styles.serverBanner : null,
        { paddingTop: insets.top + 6 },
      ]}
      testID="network-status-banner"
    >
      <Text style={styles.text}>{message}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    zIndex: 1000,
    top: 0,
    right: 0,
    left: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 7,
    backgroundColor: colors.danger,
  },
  serverBanner: {
    backgroundColor: '#b45309',
  },
  text: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    textAlign: 'center',
  },
})
