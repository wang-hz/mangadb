import { type PropsWithChildren, useEffect, useState } from 'react'
import { AppState, StyleSheet, View } from 'react-native'

export function AppPrivacyShield({ children }: PropsWithChildren) {
  const [isVisible, setIsVisible] = useState(
    AppState.currentState === 'inactive' || AppState.currentState === 'background',
  )

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setIsVisible(nextState !== 'active')
    })

    return () => subscription.remove()
  }, [])

  return (
    <View style={styles.container}>
      {children}
      {isVisible
        ? (
            <View
              pointerEvents="auto"
              style={styles.shield}
              testID="app-privacy-shield"
            />
          )
        : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  shield: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#f5f7fa',
  },
})
