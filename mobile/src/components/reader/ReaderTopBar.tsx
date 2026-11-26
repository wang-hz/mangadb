import { Ionicons } from '@expo/vector-icons'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { readerChrome } from './readerChrome'

interface ReaderTopBarProps {
  title: string
  onBack: () => void
  onOpenInfo: () => void
  onOpenSettings: () => void
}

export function ReaderTopBar({ title, onBack, onOpenInfo, onOpenSettings }: ReaderTopBarProps) {
  return (
    <View style={styles.bar}>
      <Pressable accessibilityLabel="退出阅读器" accessibilityRole="button" onPress={onBack} style={styles.button}>
        <Ionicons color="#ffffff" name="chevron-back" size={25} />
      </Pressable>
      <Text numberOfLines={1} style={styles.title}>{title}</Text>
      <Pressable accessibilityLabel="漫画信息" accessibilityRole="button" onPress={onOpenInfo} style={styles.button}>
        <Ionicons color="#ffffff" name="information-circle-outline" size={24} />
      </Pressable>
      <Pressable accessibilityLabel="打开阅读设置" accessibilityRole="button" onPress={onOpenSettings} style={styles.button}>
        <Ionicons color="#ffffff" name="options-outline" size={23} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 5,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: readerChrome.border,
    backgroundColor: readerChrome.surface,
  },
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  title: { flex: 1, color: readerChrome.text, fontSize: 14, fontWeight: '600', textAlign: 'center' },
})
