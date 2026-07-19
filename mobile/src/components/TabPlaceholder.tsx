import { StyleSheet, Text, View } from 'react-native'
import { colors } from '@/theme/colors'

interface TabPlaceholderProps {
  title: string
  message: string
}

export function TabPlaceholder({ title, message }: TabPlaceholderProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
    backgroundColor: colors.background,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  message: {
    color: colors.muted,
    fontSize: 15,
    textAlign: 'center',
  },
})
