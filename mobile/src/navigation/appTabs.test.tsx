import { fireEvent, render, screen } from '@testing-library/react-native'
import { router } from 'expo-router'
import TabLayout from '@/app/(app)/(tabs)/_layout'
import SettingsScreen from '@/app/(app)/(tabs)/settings/index'
import LegacyDownloadsScreen from '@/app/(app)/(tabs)/downloads'

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  Tabs: Object.assign(() => null, { Screen: () => null }),
  Redirect: () => null,
}))

it('orders visible tabs and keeps the library as the initial screen', () => {
  const layout = TabLayout()
  expect(layout.props.initialRouteName).toBe('mangas')
  const tabs = layout.props.children.filter((child: { props: { options: { href?: unknown } } }) =>
    child.props.options.href !== null)
  expect(tabs.map((child: { props: { options: { title: string } } }) => child.props.options.title))
    .toEqual(['继续阅读', '漫画', '标签', '设置'])
  expect(tabs[3].props.options.headerShown).toBe(false)
})

it.each([
  ['账号与服务器', 'account'], ['阅读设置', 'reading'],
  ['下载', 'downloads'], ['稳定性诊断', 'diagnostics'],
])('opens the %s settings subpage', (title, route) => {
  render(<SettingsScreen />)
  fireEvent.press(screen.getByText(title))
  expect(router.push).toHaveBeenLastCalledWith(`/(app)/(tabs)/settings/${route}`)
})

it('redirects the legacy downloads URL to the settings subpage', () => {
  expect(LegacyDownloadsScreen().props.href).toBe('/(app)/(tabs)/settings/downloads')
})
