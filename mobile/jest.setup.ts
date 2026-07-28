jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}))

jest.mock('expo-keep-awake', () => ({
  useKeepAwake: jest.fn(),
}))

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: {
      View,
      createAnimatedComponent: (component: unknown) => component,
    },
    runOnJS: (callback: (...args: unknown[]) => unknown) => callback,
    useAnimatedReaction: jest.fn(),
    useAnimatedStyle: (factory: () => object) => factory(),
    useReducedMotion: () => false,
    useSharedValue: (value: unknown) => ({ value }),
    withTiming: (value: unknown) => value,
  }
})

jest.mock('react-native-gesture-handler', () => {
  const React = require('react')
  const { View } = require('react-native')
  const gesture = new Proxy({}, {
    get: () => () => gesture,
  })
  return {
    Gesture: {
      Exclusive: () => gesture,
      Pan: () => gesture,
      Pinch: () => gesture,
      Race: () => gesture,
      Simultaneous: () => gesture,
      Tap: () => gesture,
    },
    GestureDetector: ({ children }: { children: unknown }) =>
      React.createElement(View, null, children),
    GestureHandlerRootView: View,
  }
})

jest.mock('@expo/vector-icons', () => {
  const React = require('react')
  const { Text } = require('react-native')
  const Icon = ({ name }: { name?: string }) => React.createElement(Text, null, name)
  Icon.glyphMap = {}
  return { Ionicons: Icon }
})
