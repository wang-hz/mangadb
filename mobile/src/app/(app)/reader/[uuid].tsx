import { router, useLocalSearchParams } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ScreenHeader } from '@/components/ScreenHeader'
import { colors } from '@/theme/colors'

export default function ReaderPlaceholderScreen() {
  const params = useLocalSearchParams<{ title?: string | string[] }>()
  const title = Array.isArray(params.title) ? params.title[0] : params.title
  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <ScreenHeader
        onBack={() => {
          if (router.canGoBack()) router.back()
          else router.replace('/(app)/(tabs)/mangas')
        }}
        title={title || '阅读器'}
      />
      <View style={styles.body}>
        <Text style={styles.title}>阅读器准备中</Text>
        <Text style={styles.message}>下一步将接入全屏翻页、跳页和相邻页预取。</Text>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.header,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 28,
    backgroundColor: colors.reader,
  },
  title: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  message: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
})
