import { act, fireEvent, render, screen } from '@testing-library/react-native'
import {
  AppState,
  FlatList,
  Modal,
  StyleSheet,
  type NativeEventSubscription,
} from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import type { Tag } from '@/api/types'
import { DEFAULT_CATALOG_FILTERS } from '@/storage/catalogFilters'
import {
  CatalogFilterSheet,
  MAX_CATALOG_TAG_SELECTION,
} from './CatalogFilterSheet'

const tag: Tag = {
  uuid: 'tag-1',
  name: '科幻',
  createAt: '2026-01-01T00:00:00.000Z',
  updateAt: '2026-01-01T00:00:00.000Z',
  tagType: {
    uuid: 'type-1',
    name: '题材',
  },
}

describe('CatalogFilterSheet', () => {
  it('validates years and applies combined accessible controls', () => {
    const onApply = jest.fn()
    render(
      <SafeAreaProvider initialMetrics={safeAreaMetrics}>
        <CatalogFilterSheet
          filters={DEFAULT_CATALOG_FILTERS}
          onApply={onApply}
          onClose={jest.fn()}
          tags={[tag]}
          tagsLoading={false}
          visible
        />
      </SafeAreaProvider>,
    )

    fireEvent.press(screen.getByText('阅读中'))
    fireEvent(screen.getByLabelText('仅看收藏'), 'valueChange', true)
    fireEvent(screen.getByLabelText('仅看已完整下载'), 'valueChange', true)
    fireEvent.press(screen.getByText('题材 · 科幻'))
    fireEvent.changeText(screen.getByLabelText('起始出版年份'), '2026')
    fireEvent.changeText(screen.getByLabelText('结束出版年份'), '2020')
    fireEvent.press(screen.getByText('应用筛选'))
    expect(screen.getByText('起始年份不能晚于结束年份')).toBeOnTheScreen()
    expect(onApply).not.toHaveBeenCalled()

    fireEvent.changeText(screen.getByLabelText('结束出版年份'), '2028')
    fireEvent.press(screen.getByText('应用筛选'))
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({
      readingState: 'reading',
      favoriteOnly: true,
      downloadedOnly: true,
      tagUuids: ['tag-1'],
      publishYearFrom: 2026,
      publishYearTo: 2028,
    }))
  })

  it('clears filters while retaining search and sort continuity', () => {
    const onApply = jest.fn()
    render(
      <SafeAreaProvider initialMetrics={safeAreaMetrics}>
        <CatalogFilterSheet
          filters={{
            ...DEFAULT_CATALOG_FILTERS,
            search: '保留的搜索',
            sortBy: 'publishDate',
            sortOrder: 'asc',
            tagUuids: ['tag-1'],
            favoriteOnly: true,
          }}
          onApply={onApply}
          onClose={jest.fn()}
          tags={[tag]}
          tagsLoading={false}
          visible
        />
      </SafeAreaProvider>,
    )

    fireEvent.press(screen.getByText('清除筛选'))
    fireEvent.press(screen.getByText('应用筛选'))
    expect(onApply).toHaveBeenCalledWith({
      ...DEFAULT_CATALOG_FILTERS,
      search: '保留的搜索',
      sortBy: 'publishDate',
      sortOrder: 'asc',
      tagUuids: [],
    })
  })

  it('limits combined tag filters to 20 selections', () => {
    const onApply = jest.fn()
    const tags = Array.from({ length: MAX_CATALOG_TAG_SELECTION + 1 }, (_, index) => ({
      ...tag,
      uuid: `tag-${index}`,
      name: `标签 ${index}`,
    }))
    render(
      <SafeAreaProvider initialMetrics={safeAreaMetrics}>
        <CatalogFilterSheet
          filters={{
            ...DEFAULT_CATALOG_FILTERS,
            tagUuids: tags.slice(0, MAX_CATALOG_TAG_SELECTION).map(item => item.uuid),
          }}
          onApply={onApply}
          onClose={jest.fn()}
          tags={[tags[MAX_CATALOG_TAG_SELECTION]!]}
          tagsLoading={false}
          visible
        />
      </SafeAreaProvider>,
    )

    fireEvent.press(screen.getByText('题材 · 标签 20'))
    expect(screen.getByText('最多可同时选择 20 个标签')).toBeOnTheScreen()
    fireEvent.press(screen.getByText('应用筛选'))
    expect(onApply.mock.calls[0]?.[0].tagUuids).toHaveLength(20)
    expect(onApply.mock.calls[0]?.[0].tagUuids).not.toContain('tag-20')
  })

  it('supports every screen direction and closes when the app leaves active state', () => {
    let appStateListener: ((state: 'background') => void) | undefined
    const remove = jest.fn()
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_event, listener) => {
      appStateListener = listener as (state: 'background') => void
      return { remove } as NativeEventSubscription
    }) as typeof AppState.addEventListener)
    const onClose = jest.fn()
    const view = render(
      <SafeAreaProvider initialMetrics={safeAreaMetrics}>
        <CatalogFilterSheet
          filters={DEFAULT_CATALOG_FILTERS}
          onApply={jest.fn()}
          onClose={onClose}
          tags={[]}
          tagsLoading={false}
          visible
        />
      </SafeAreaProvider>,
    )

    expect(view.UNSAFE_getByType(Modal).props.supportedOrientations).toEqual([
      'portrait',
      'portrait-upside-down',
      'landscape-left',
      'landscape-right',
    ])
    act(() => appStateListener?.('background'))
    expect(onClose).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(remove).toHaveBeenCalledTimes(1)
    jest.restoreAllMocks()
  })

  it('forwards server tag searches and requests the next virtualized page', () => {
    const onChangeTagSearch = jest.fn()
    const onLoadMoreTags = jest.fn()
    const view = render(
      <SafeAreaProvider initialMetrics={safeAreaMetrics}>
        <CatalogFilterSheet
          filters={DEFAULT_CATALOG_FILTERS}
          onApply={jest.fn()}
          onChangeTagSearch={onChangeTagSearch}
          onClose={jest.fn()}
          onLoadMoreTags={onLoadMoreTags}
          tags={[tag]}
          tagsHasMore
          tagsLoading={false}
          visible
        />
      </SafeAreaProvider>,
    )

    fireEvent.changeText(screen.getByLabelText('搜索标签'), '科幻')
    expect(onChangeTagSearch).toHaveBeenCalledWith('科幻')
    act(() => view.UNSAFE_getByType(FlatList).props.onEndReached())
    expect(onLoadMoreTags).toHaveBeenCalledTimes(1)
  })

  it('shows and can remove a separately fetched selected tag', () => {
    const onApply = jest.fn()
    render(
      <SafeAreaProvider initialMetrics={safeAreaMetrics}>
        <CatalogFilterSheet
          filters={{ ...DEFAULT_CATALOG_FILTERS, tagUuids: [tag.uuid] }}
          onApply={onApply}
          onClose={jest.fn()}
          tags={[tag]}
          tagsLoading={false}
          visible
        />
      </SafeAreaProvider>,
    )

    const selectedTag = screen.getByRole('checkbox', { checked: true })
    expect(screen.getByText('题材 · 科幻')).toBeOnTheScreen()
    fireEvent.press(selectedTag)
    fireEvent.press(screen.getByText('应用筛选'))
    expect(onApply.mock.calls[0]?.[0].tagUuids).toEqual([])
  })

  it('keeps the action bar outside a shrinkable tag list on short screens', () => {
    const view = render(
      <SafeAreaProvider initialMetrics={{
        ...safeAreaMetrics,
        frame: { ...safeAreaMetrics.frame, height: 320 },
      }}>
        <CatalogFilterSheet
          filters={DEFAULT_CATALOG_FILTERS}
          onApply={jest.fn()}
          onClose={jest.fn()}
          tags={[tag]}
          tagsLoading={false}
          visible
        />
      </SafeAreaProvider>,
    )

    expect(StyleSheet.flatten(view.UNSAFE_getByType(FlatList).props.style))
      .toMatchObject({ flexShrink: 1 })
    expect(screen.getByText('清除筛选')).toBeOnTheScreen()
    expect(screen.getByText('应用筛选')).toBeOnTheScreen()
  })
})

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
}
