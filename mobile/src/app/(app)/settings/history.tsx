import { router, useFocusEffect } from 'expo-router'
import { useCallback } from 'react'

export default function LegacyReadingHistoryScreen() {
  useFocusEffect(useCallback(() => {
    // Reuse the tabs on a running app and replace this screen on a cold start.
    router.dismissTo('/(app)/(tabs)/recent')
  }, []))
  return null
}
