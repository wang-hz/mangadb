import { router } from 'expo-router'
import { useState } from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'
import { CenteredState } from '@/components/CenteredState'
import { PrimaryButton } from '@/components/PrimaryButton'
import { RecentReadingCard } from '@/components/RecentReadingSection'
import { useRecentReading } from '@/hooks/useRecentReading'
import { useSession } from '@/session/SessionContext'
import { RECENT_READING_LIMIT } from '@/storage/progress'
import { colors } from '@/theme/colors'

export function ReadingRecordsScreen({ history = false }: { history?: boolean }) {
  const { api, serverUrl, auth } = useSession()
  const recent = useRecentReading(serverUrl, auth?.user.uuid)
  const [refreshing, setRefreshing] = useState(false)
  if (recent.status === 'loading') return <CenteredState title="正在读取阅读记录" loading />
  if (recent.status === 'error') {
    return (
      <View style={styles.state}>
        <Text accessibilityRole="alert">{recent.error}</Text>
        <PrimaryButton onPress={() => { void recent.refresh() }}>重试</PrimaryButton>
      </View>
    )
  }
  const entries = recent.entries.filter(entry =>
    !entry.hiddenFromRecent && (history || entry.state === 'reading'))
  const records = history
    ? entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, RECENT_READING_LIMIT)
    : entries
  return (
    <FlatList
      contentContainerStyle={styles.content}
      data={records}
      keyExtractor={entry => entry.manga.uuid}
      ListEmptyComponent={history
        ? <CenteredState title="暂无阅读历史" message="开始阅读后，漫画会显示在这里。" />
        : <CenteredState title="暂无继续阅读的漫画" message="开始阅读后，未完成的漫画会显示在这里。" />}
      onRefresh={() => {
        setRefreshing(true)
        void recent.refresh().finally(() => setRefreshing(false))
      }}
      refreshing={refreshing}
      renderItem={({ item }) => (
        <RecentReadingCard
          api={api!}
          entry={item}
          fullWidth
          onPress={entry => router.push({
            pathname: '/(app)/reader/[uuid]',
            params: {
              uuid: entry.manga.uuid,
              title: entry.manga.displayTitle || entry.manga.originalTitle,
            },
          })}
          serverUrl={serverUrl!}
          userUuid={auth!.user.uuid}
        />
      )}
      style={styles.screen}
    />
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, padding: 16, gap: 12, width: '100%', maxWidth: 720, alignSelf: 'center' },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
})
