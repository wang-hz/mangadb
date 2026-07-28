import { render } from '@testing-library/react-native'
import { FlatList } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import type { ApiClient } from '@/api/client'
import type { MangaDetail } from '@/api/types'
import { DEFAULT_READER_PREFERENCES } from '@/storage/readerPreferences'
import { ScrollingReader } from './ScrollingReader'

jest.mock('expo-image', () => ({
  Image: Object.assign(() => null, { prefetch: jest.fn().mockResolvedValue(true) }),
}))
jest.mock('@/components/reader/ReaderSettingsModal', () => ({
  ReaderSettingsModal: () => null,
}))

const manga: MangaDetail = {
  uuid: 'manga-1',
  displayTitle: '测试漫画',
  originalTitle: '测试漫画',
  fullname: 'test-manga',
  publishDate: null,
  cover: 0,
  createAt: '2026-07-19T00:00:00.000Z',
  updateAt: '2026-07-19T00:00:00.000Z',
  pages: ['0.jpg', '1.jpg', '2.jpg'],
  mangaTags: [],
}

describe('ScrollingReader preferences', () => {
  it('includes the selected gap in list layouts and rendered pages', () => {
    const view = render(
      <SafeAreaProvider initialMetrics={safeAreaMetrics}>
        <ScrollingReader
          api={{
            authorizationHeaders: () => ({ Authorization: 'Bearer token' }),
            url: (path: string) => `https://example.com${path}`,
          } as unknown as ApiClient}
          completed={false}
          manga={manga}
          mode="scroll"
          onBack={jest.fn()}
          onModeChange={jest.fn()}
          onMarkCompleted={jest.fn().mockResolvedValue(undefined)}
          onOpenSettings={jest.fn()}
          onPageChange={jest.fn()}
          onRefreshMetadata={jest.fn().mockResolvedValue(undefined)}
          onReturnToDetail={jest.fn()}
          pageIndex={0}
          preferences={{ ...DEFAULT_READER_PREFERENCES, scrollGap: 16 }}
          settingsVisible={false}
          serverUrl="https://example.com"
          userUuid="user-1"
        />
      </SafeAreaProvider>,
    )
    const list = view.UNSAFE_getByType(FlatList)
    const first = list.props.getItemLayout(null, 0)
    const second = list.props.getItemLayout(null, 1)
    const last = list.props.getItemLayout(null, 2)
    expect(second.offset).toBe(first.length)
    expect(first.length - last.length).toBe(16)
    expect(list.props.renderItem({ item: '0.jpg', index: 0 }).props.pageGap).toBe(16)
    expect(list.props.renderItem({ item: '2.jpg', index: 2 }).props.pageGap).toBe(0)
  })
})

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
}
