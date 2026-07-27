import { Ionicons } from '@expo/vector-icons'
import { Tabs } from 'expo-router'
import { colors } from '@/theme/colors'

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.header },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="mangas"
        options={{
          title: '漫画',
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons color={color} name={focused ? 'library' : 'library-outline'} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="tags"
        options={{
          title: '标签',
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons color={color} name={focused ? 'pricetags' : 'pricetags-outline'} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="downloads"
        options={{
          title: '下载',
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons
              color={color}
              name={focused ? 'cloud-download' : 'cloud-download-outline'}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '设置',
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons color={color} name={focused ? 'settings' : 'settings-outline'} size={size} />
          ),
        }}
      />
    </Tabs>
  )
}
