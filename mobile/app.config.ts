import type { ExpoConfig } from 'expo/config'

const config: ExpoConfig = {
  name: 'MangaDB',
  slug: 'mangadb',
  version: '0.1.0',
  scheme: 'mangadb',
  platforms: ['ios', 'android'],
  orientation: 'default',
  userInterfaceStyle: 'light',
  icon: './assets/icon.png',
  ios: {
    bundleIdentifier: 'top.wanghaizhou.mangadb',
    buildNumber: '1',
    supportsTablet: false,
    config: {
      usesNonExemptEncryption: false,
    },
    infoPlist: {
      NSLocalNetworkUsageDescription: 'MangaDB 需要访问局域网中的漫画服务器。',
      NSAppTransportSecurity: {
        NSAllowsLocalNetworking: true,
      },
    },
  },
  android: {
    package: 'top.wanghaizhou.mangadb',
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#111827',
    },
  },
  plugins: [
    'expo-router',
    ['expo-secure-store', { configureAndroidBackup: true }],
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 160,
        resizeMode: 'contain',
        backgroundColor: '#111827',
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          usesCleartextTraffic: true,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
}

export default config
