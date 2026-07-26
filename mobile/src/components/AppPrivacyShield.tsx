import { BlurView } from 'expo-blur'
import { type PropsWithChildren, useEffect, useState } from 'react'
import { AppState, StyleSheet, View } from 'react-native'

export function AppPrivacyShield({ children }: PropsWithChildren) {
  const [isVisible, setIsVisible] = useState(AppState.currentState === 'background')

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setIsVisible(nextState !== 'active')
    })

    return () => subscription.remove()
  }, [])

  return (
    <View style={styles.container}>
      {children}
      <BlurView
        intensity={100}
        pointerEvents={isVisible ? 'auto' : 'none'}
        style={[styles.shield, !isVisible && styles.hidden]}
        testID="app-privacy-shield"
        tint="default"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  shield: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(245, 247, 250, 0.25)',
  },
  hidden: {
    opacity: 0,
  },
})
