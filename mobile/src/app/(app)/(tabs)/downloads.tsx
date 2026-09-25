import { Redirect } from 'expo-router'

export default function LegacyDownloadsScreen() {
  return <Redirect href="/(app)/(tabs)/settings/downloads" />
}
