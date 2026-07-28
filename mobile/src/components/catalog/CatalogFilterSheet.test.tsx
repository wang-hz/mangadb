import { fireEvent, render, screen } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import type { Tag } from '@/api/types'
import { DEFAULT_CATALOG_FILTERS } from '@/storage/catalogFilters'
import { CatalogFilterSheet } from './CatalogFilterSheet'

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
})

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
}
