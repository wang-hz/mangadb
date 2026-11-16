import { Ionicons } from '@expo/vector-icons'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { ReaderMode } from '@/utils/reader'
import { readerChrome } from './readerChrome'
import { ReaderPreferencesControls } from './ReaderPreferencesControls'

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
  const insets = useSafeAreaInsets()
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      supportedOrientations={[
        'portrait',
        'portrait-upside-down',
        'landscape-left',
        'landscape-right',
      ]}
      transparent
      visible={visible}
    >
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18), marginLeft: insets.left + 8, marginRight: insets.right + 8, marginTop: insets.top + 8 }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>阅读设置</Text>
              <Text style={styles.subtitle}>修改会立即生效并保存为本机默认值</Text>
            </View>
            <Pressable
              accessibilityLabel="关闭阅读设置"
              accessibilityRole="button"
              hitSlop={10}
              onPress={onClose}
              style={styles.closeButton}
            >
              <Ionicons color="#ffffff" name="close" size={25} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            <ReaderPreferencesControls currentMode={currentMode} dark onDefaultModeChange={onDefaultModeChange} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#66666d', alignSelf: 'center', marginTop: 9 },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: readerChrome.border,
    backgroundColor: readerChrome.surface,
  },
  header: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#3b4049',
  },
  title: {
    color: '#ffffff',
    fontSize: 19,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 3,
    color: '#aeb4bf',
    fontSize: 12,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: '#292e36',
  },
  content: {
    padding: 18,
    paddingBottom: 28,
  },
})
