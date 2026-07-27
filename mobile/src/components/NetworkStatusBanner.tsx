import { onlineManager } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '@/theme/colors'

export function NetworkStatusBanner() {
  const insets = useSafeAreaInsets()
  const isOnline = useSyncExternalStore(
    onStoreChange => onlineManager.subscribe(onStoreChange),
    () => onlineManager.isOnline(),
    () => true,
  )

  if (isOnline) return null

  return (
    <View
      accessibilityLiveRegion="assertive"
      accessibilityRole="alert"
      pointerEvents="none"
      style={[styles.banner, { paddingTop: insets.top + 6 }]}
      testID="network-status-banner"
    >
      <Text style={styles.text}>网络已断开，恢复连接后将自动重试</Text>
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
  text: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    textAlign: 'center',
  },
})
