import { useState } from 'react'
import {
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native'
import { useReaderPreferences } from '@/providers/ReaderPreferencesContext'
import type { ReaderPreferences } from '@/storage/readerPreferences'
import { colors } from '@/theme/colors'
import type { ReaderMode } from '@/utils/reader'

interface ReaderPreferencesControlsProps {
  dark?: boolean
  onDefaultModeChange?: (mode: ReaderMode) => void
}

export function ReaderPreferencesControls({
  dark = false,
  onDefaultModeChange,
}: ReaderPreferencesControlsProps) {
  const { preferences, status, updatePreferences } = useReaderPreferences()
  const [pending, setPending] = useState(false)
  const palette = dark ? darkPalette : lightPalette

  const update = async <Key extends keyof ReaderPreferences>(
    key: Key,
    value: ReaderPreferences[Key],
  ) => {
    if (pending || preferences[key] === value) return
    const previous = preferences[key]
    setPending(true)
    if (key === 'defaultMode') onDefaultModeChange?.(value as ReaderMode)
    try {
      await updatePreferences({ [key]: value })
    } catch {
      if (key === 'defaultMode') onDefaultModeChange?.(previous as ReaderMode)
      Alert.alert('无法保存阅读设置', '设置已恢复，请检查本机存储后重试。')
    } finally {
      setPending(false)
    }
  }

  const disabled = status === 'loading' || pending

  return (
    <View accessibilityLabel="阅读设置" style={styles.root}>
      <PreferenceRow label="默认阅读模式" palette={palette}>
        <SegmentedControl
          disabled={disabled}
          onChange={value => { void update('defaultMode', value) }}
          options={[
            { label: '翻页', value: 'paged' },
            { label: '连续滚动', value: 'scroll' },
          ]}
          palette={palette}
          value={preferences.defaultMode}
        />
      </PreferenceRow>

      <PreferenceRow label="翻页方向" palette={palette}>
        <SegmentedControl
          disabled={disabled}
          onChange={value => { void update('pagedDirection', value) }}
          options={[
            { label: '从左到右', value: 'ltr' },
            { label: '从右到左', value: 'rtl' },
          ]}
          palette={palette}
          value={preferences.pagedDirection}
        />
      </PreferenceRow>

      <PreferenceRow label="翻页图片显示" palette={palette}>
        <SegmentedControl
          disabled={disabled}
          onChange={value => { void update('pagedFit', value) }}
          options={[
            { label: '完整显示', value: 'contain' },
            { label: '铺满屏幕', value: 'cover' },
          ]}
          palette={palette}
          value={preferences.pagedFit}
        />
      </PreferenceRow>

      <PreferenceRow label="滚动页间距" palette={palette}>
        <SegmentedControl
          disabled={disabled}
          onChange={value => { void update('scrollGap', value) }}
          options={[
            { label: '无', value: 0 },
            { label: '小', value: 8 },
            { label: '大', value: 16 },
          ]}
          palette={palette}
          value={preferences.scrollGap}
        />
      </PreferenceRow>

      <PreferenceRow label="控制栏自动隐藏" palette={palette}>
        <SegmentedControl
          disabled={disabled}
          onChange={value => { void update('controlsAutoHideMs', value) }}
          options={[
            { label: '3 秒', value: 3000 },
            { label: '5 秒', value: 5000 },
            { label: '不隐藏', value: null },
          ]}
          palette={palette}
          value={preferences.controlsAutoHideMs}
        />
      </PreferenceRow>

      <PreferenceRow label="阅读画面亮度" palette={palette}>
        <SegmentedControl
          disabled={disabled}
          onChange={value => { void update('readerDimLevel', value) }}
          options={[
            { label: '跟随系统', value: 0 },
            { label: '柔和', value: 0.2 },
            { label: '夜间', value: 0.4 },
          ]}
          palette={palette}
          value={preferences.readerDimLevel}
        />
        <Text style={[styles.help, { color: palette.muted }]}>
          仅调暗阅读画面，不修改设备系统亮度
        </Text>
      </PreferenceRow>

      <View style={styles.switchRow}>
        <View style={styles.switchCopy}>
          <Text style={[styles.label, { color: palette.text }]}>阅读时保持屏幕常亮</Text>
          <Text style={[styles.help, { color: palette.muted }]}>仅在阅读器打开期间生效</Text>
        </View>
        <Switch
          accessibilityLabel="阅读时保持屏幕常亮"
          disabled={disabled}
          onValueChange={value => { void update('keepAwake', value) }}
          trackColor={{ false: palette.track, true: colors.brand }}
          value={preferences.keepAwake}
        />
      </View>
    </View>
  )
}

interface Palette {
  text: string
  muted: string
  border: string
  inactive: string
  active: string
  activeText: string
  track: string
}

function PreferenceRow({
  label,
  palette,
  children,
}: {
  label: string
  palette: Palette
  children: React.ReactNode
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
      {children}
    </View>
  )
}

function SegmentedControl<Value extends string | number | null>({
  value,
  options,
  palette,
  disabled,
  onChange,
}: {
  value: Value
  options: Array<{ label: string; value: Value }>
  palette: Palette
  disabled: boolean
  onChange: (value: Value) => void
}) {
  return (
    <View
      accessibilityRole="radiogroup"
      style={[styles.segments, { backgroundColor: palette.inactive, borderColor: palette.border }]}
    >
      {options.map(option => {
        const selected = option.value === value
        return (
          <Pressable
            accessibilityLabel={option.label}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, disabled }}
            disabled={disabled}
            key={`${option.label}:${String(option.value)}`}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected ? { backgroundColor: palette.active } : null]}
          >
            <Text style={[
              styles.segmentText,
              { color: selected ? palette.activeText : palette.muted },
            ]}>
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const lightPalette: Palette = {
  text: colors.text,
  muted: colors.muted,
  border: colors.border,
  inactive: '#f3f4f6',
  active: '#ffffff',
  activeText: colors.brand,
  track: '#d1d5db',
}

const darkPalette: Palette = {
  text: '#ffffff',
  muted: '#b8bcc5',
  border: '#444a55',
  inactive: '#272b32',
  active: '#ffffff',
  activeText: '#111827',
  track: '#555b66',
}

const styles = StyleSheet.create({
  root: {
    gap: 18,
  },
  row: {
    gap: 9,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  help: {
    fontSize: 12,
    lineHeight: 17,
  },
  segments: {
    minHeight: 42,
    flexDirection: 'row',
    padding: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
  },
  segment: {
    minWidth: 56,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 7,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  switchRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  switchCopy: {
    flex: 1,
    gap: 3,
  },
})
