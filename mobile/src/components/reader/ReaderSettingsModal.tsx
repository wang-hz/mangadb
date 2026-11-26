import { ScrollView, StyleSheet } from 'react-native'
import type { ReaderMode } from '@/utils/reader'
import { ReaderPreferencesControls } from './ReaderPreferencesControls'
import { ReaderSheet } from './ReaderSheet'

export function ReaderSettingsModal({
  visible,
  currentMode,
  onClose,
  onDefaultModeChange,
}: {
  currentMode?: ReaderMode
  visible: boolean
  onClose: () => void
  onDefaultModeChange: (mode: ReaderMode) => void
}) {
  return (
    <ReaderSheet title="阅读设置" visible={visible} onClose={onClose}>
      <ScrollView contentContainerStyle={styles.content}>
        <ReaderPreferencesControls currentMode={currentMode} dark onDefaultModeChange={onDefaultModeChange} />
      </ScrollView>
    </ReaderSheet>
  )
}

const styles = StyleSheet.create({
  content: {
    padding: 18,
    paddingBottom: 28,
  },
})
