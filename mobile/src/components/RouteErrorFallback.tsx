import { type ErrorBoundaryProps } from 'expo-router'
import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { recordDiagnostic } from '@/diagnostics/localDiagnostics'
import { colors } from '@/theme/colors'

interface RouteErrorFallbackProps extends ErrorBoundaryProps {
  title: string
  message: string
  leaveLabel: string
  onLeave: () => void
}

export function RouteErrorFallback({
  error,
  retry,
  title,
  message,
  leaveLabel,
  onLeave,
}: RouteErrorFallbackProps) {
  useEffect(() => {
    void recordDiagnostic('js-error', error.name || 'Error').catch(() => {})
  }, [error])

  return (
    <View style={styles.root}>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      <Pressable accessibilityRole="button" onPress={() => { void retry() }} style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>重试</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onLeave} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>{leaveLabel}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    gap: 14,
    padding: 28,
    backgroundColor: colors.background,
  },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  message: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  primaryButton: {
    alignItems: 'center',
    padding: 13,
    borderRadius: 10,
    backgroundColor: colors.brand,
  },
  primaryButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  secondaryButton: {
    alignItems: 'center',
    padding: 13,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  secondaryButtonText: { color: colors.text, fontSize: 16, fontWeight: '700' },
})
