import { StyleSheet, View } from 'react-native'
import type { ReaderDimLevel } from '@/storage/readerPreferences'

export function ReaderDimmer({ level }: { level: ReaderDimLevel }) {
  if (level === 0) return null

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.overlay, { opacity: level }]}
      testID="reader-dimmer"
    />
  )
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: '#000000',
  },
})
