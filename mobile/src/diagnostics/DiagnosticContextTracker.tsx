import { usePathname } from 'expo-router'
import { useEffect } from 'react'
import { AppState, useWindowDimensions } from 'react-native'
import {
  recordDiagnostic,
  setDiagnosticContext,
  viewportBucket,
} from './localDiagnostics'

export function DiagnosticContextTracker() {
  const pathname = usePathname()
  const { width, height } = useWindowDimensions()

  useEffect(() => {
    setDiagnosticContext({ route: pathname, viewport: viewportBucket(width, height) })
  }, [height, pathname, width])

  useEffect(() => {
    const subscription = AppState.addEventListener('memoryWarning', () => {
      void recordDiagnostic('reader', 'memory-warning').catch(() => {})
    })
    return () => subscription.remove()
  }, [])

  return null
}
