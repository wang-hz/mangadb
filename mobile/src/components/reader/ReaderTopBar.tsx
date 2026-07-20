import { Ionicons } from '@expo/vector-icons'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { ReaderMode } from '@/utils/reader'

interface ReaderTopBarProps {
  title: string
  topInset: number
  mode: ReaderMode
  onBack: () => void
  onModeChange: (mode: ReaderMode) => void
  onOpenSettings: () => void
}

export function ReaderTopBar({
  title,
  topInset,
  mode,
  onBack,
  onModeChange,
  onOpenSettings,
}: ReaderTopBarProps) {
  return (
    <View style={[styles.bar, { paddingTop: topInset }]}>
      <Pressable
        accessibilityLabel="退出阅读器"
        accessibilityRole="button"
        hitSlop={10}
        onPress={onBack}
        style={styles.backButton}
      >
        <Ionicons color="#ffffff" name="chevron-back" size={27} />
      </Pressable>
      <Text numberOfLines={1} style={styles.title}>{title}</Text>
      <Pressable
        accessibilityLabel="打开阅读设置"
        accessibilityRole="button"
        hitSlop={6}
        onPress={onOpenSettings}
        style={styles.settingsButton}
      >
        <Ionicons color="#ffffff" name="settings-outline" size={21} />
      </Pressable>
      <View accessibilityRole="tablist" style={styles.modeSwitch}>
        <ModeButton
          active={mode === 'paged'}
          label="翻页"
          onPress={() => onModeChange('paged')}
        />
        <ModeButton
          active={mode === 'scroll'}
          label="滚动"
          onPress={() => onModeChange('scroll')}
        />
      </View>
    </View>
  )
}

function ModeButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.modeButton, active ? styles.modeButtonActive : null]}
    >
      <Text style={active ? styles.modeTextActive : styles.modeText}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingBottom: 6,
    backgroundColor: 'rgba(0,0,0,0.82)',
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  settingsButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
  },
  title: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  modeSwitch: {
    flexDirection: 'row',
    gap: 2,
    padding: 2,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  modeButton: {
    minWidth: 45,
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 7,
  },
  modeButtonActive: {
    backgroundColor: '#ffffff',
  },
  modeText: {
    color: '#d4d4d4',
    fontSize: 12,
    fontWeight: '600',
  },
  modeTextActive: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '700',
  },
})
