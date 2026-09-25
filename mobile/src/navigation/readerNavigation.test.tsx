import { useState } from 'react'
import { Pressable, Text } from 'react-native'
import { router, Stack, Tabs } from 'expo-router'
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library'
import { useReaderReturn } from './useReaderReturn'

function Root() { return <Stack screenOptions={{ headerShown: false, animation: 'none' }} /> }
function TabLayout() { return <Tabs screenOptions={{ headerShown: false }} /> }
function SettingsLayout() { return <Stack screenOptions={{ headerShown: false, animation: 'none' }} /> }
function Source({ direct = false }: { direct?: boolean }) {
  const [filter, setFilter] = useState('all')
  return <>
    <Text>filter:{filter}</Text>
    <Pressable onPress={() => setFilter('reading')}><Text>选择筛选</Text></Pressable>
    <Pressable onPress={() => router.push({
      pathname: direct ? '/(app)/reader/[uuid]' : '/(app)/manga/[uuid]', params: { uuid: 'm1' },
    })}><Text>打开漫画</Text></Pressable>
  </>
}
function Detail() {
  return <Pressable onPress={() => router.push({ pathname: '/(app)/reader/[uuid]', params: { uuid: 'm1' } })}>
    <Text>开始阅读</Text>
  </Pressable>
}
function Reader() {
  const leave = useReaderReturn('m1')
  return <>
    <Pressable onPress={() => leave('detail')}><Text>返回漫画</Text></Pressable>
    <Pressable onPress={() => leave('list')}><Text>返回列表</Text></Pressable>
  </>
}
const routes = {
  '(app)/_layout': Root,
  '(app)/(tabs)/_layout': TabLayout,
  '(app)/(tabs)/mangas': Source,
  '(app)/(tabs)/recent': () => <Source direct />,
  '(app)/(tabs)/settings/_layout': SettingsLayout,
  '(app)/(tabs)/settings/downloads': Source,
  '(app)/tag/[uuid]': Source,
  '(app)/manga/[uuid]': Detail,
  '(app)/reader/[uuid]': Reader,
}

it.each(['/mangas', '/tag/t1', '/settings/downloads'])('returns to %s with source state intact', async initialUrl => {
  const view = renderRouter(routes, { initialUrl })
  fireEvent.press(screen.getByText('选择筛选'))
  fireEvent.press(screen.getByText('打开漫画'))
  fireEvent.press(await screen.findByText('开始阅读'))
  fireEvent.press(await screen.findByText('返回列表'))
  await waitFor(() => expect(view.getPathname()).toBe(initialUrl))
  expect(screen.getByText('filter:reading')).toBeOnTheScreen()
})

it('reuses the existing detail without leaving a duplicate in history', async () => {
  const view = renderRouter(routes, { initialUrl: '/mangas' })
  fireEvent.press(screen.getByText('打开漫画'))
  fireEvent.press(await screen.findByText('开始阅读'))
  fireEvent.press(await screen.findByText('返回漫画'))
  await waitFor(() => expect(view.getPathname()).toBe('/manga/m1'))
  act(() => router.back())
  await waitFor(() => expect(view.getPathname()).toBe('/mangas'))
})

it('returns directly to recent reading or replaces the reader with detail', async () => {
  const view = renderRouter(routes, { initialUrl: '/recent' })
  fireEvent.press(screen.getByText('选择筛选'))
  fireEvent.press(screen.getByText('打开漫画'))
  fireEvent.press(await screen.findByText('返回列表'))
  await waitFor(() => expect(view.getPathname()).toBe('/recent'))
  expect(screen.getByText('filter:reading')).toBeOnTheScreen()
  fireEvent.press(screen.getByText('打开漫画'))
  fireEvent.press(await screen.findByText('返回漫画'))
  await waitFor(() => expect(view.getPathname()).toBe('/manga/m1'))
  act(() => router.back())
  await waitFor(() => expect(view.getPathname()).toBe('/recent'))
})

it.each(['返回列表', '返回漫画'])('handles a direct reader deep link with %s', async label => {
  const view = renderRouter(routes, { initialUrl: '/reader/m1' })
  fireEvent.press(screen.getByText(label))
  await waitFor(() => expect(view.getPathname()).toBe(label === '返回漫画' ? '/manga/m1' : '/mangas'))
})
