import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

export function useScreenReaderEnabled() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    let active = true
    void AccessibilityInfo.isScreenReaderEnabled().then(value => {
      if (active && value) setEnabled(true)
    }).catch(() => {})
    const subscription = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      setEnabled,
    )
    return () => {
      active = false
      subscription.remove()
    }
  }, [])

  return enabled
}
