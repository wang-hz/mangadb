import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native'
import { colors } from '@/theme/colors'

const entries = [
  { title: '账号与服务器', route: 'account', icon: 'person-outline' },
  { title: '阅读设置', route: 'reading', icon: 'book-outline' },
  { title: '下载', route: 'downloads', icon: 'cloud-download-outline' },
  { title: '稳定性诊断', route: 'diagnostics', icon: 'pulse-outline' },
] as const

export default function SettingsScreen() {
  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      {entries.map(entry => (
        <Pressable
          accessibilityRole="button"
          key={entry.route}
          onPress={() => router.push(`/(app)/(tabs)/settings/${entry.route}`)}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
        >
          <Ionicons color={colors.brand} name={entry.icon} size={24} />
          <Text style={styles.title}>{entry.title}</Text>
          <Ionicons color={colors.muted} name="chevron-forward" size={20} />
        </Pressable>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 12, width: '100%', maxWidth: 720, alignSelf: 'center' },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 16, borderRadius: 14, backgroundColor: colors.surface },
  title: { flex: 1, fontSize: 16, color: colors.text, fontWeight: '600' },
})
