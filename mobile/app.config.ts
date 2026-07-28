import type { ExpoConfig } from 'expo/config'

const appVersion = process.env.MANGADB_APP_VERSION?.trim() || '0.1.0'
const buildNumber = process.env.MANGADB_BUILD_NUMBER?.trim() || '1'
const androidVersionCode = Number(buildNumber)
const allowLanHttp = process.env.MANGADB_ALLOW_LAN_HTTP?.trim().toLowerCase() === 'true'

if (!Number.isSafeInteger(androidVersionCode) || androidVersionCode < 1) {
  throw new Error('MANGADB_BUILD_NUMBER must be a positive integer')
}

const config: ExpoConfig = {
  name: 'MangaDB',
  slug: 'mangadb',
  version: appVersion,
  scheme: 'mangadb',
  platforms: ['ios', 'android'],
  orientation: 'default',
  userInterfaceStyle: 'light',
  backgroundColor: '#f5f7fa',
  extra: {
    allowLanHttp,
  },
  icon: './assets/icon.png',
  ios: {
    bundleIdentifier: 'top.wanghaizhou.mangadb',
    buildNumber,
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
    versionCode: androidVersionCode,
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
          usesCleartextTraffic: allowLanHttp,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
}

export default config
