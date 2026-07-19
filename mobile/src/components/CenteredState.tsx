import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { colors } from '@/theme/colors'

interface CenteredStateProps {
  title: string
  message?: string
  loading?: boolean
}

export function CenteredState({ title, message, loading = false }: CenteredStateProps) {
  return (
    <View style={styles.container}>
      {loading ? <ActivityIndicator color={colors.brand} size="large" /> : null}
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    backgroundColor: colors.background,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  message: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
})
