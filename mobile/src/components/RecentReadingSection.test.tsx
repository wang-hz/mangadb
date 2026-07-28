import { fireEvent, render, screen } from '@testing-library/react-native'
import type { ApiClient } from '@/api/client'
import type { RecentReadingEntry } from '@/storage/progress'
import { RecentReadingSection } from './RecentReadingSection'

jest.mock('expo-image', () => ({ Image: () => null }))

const entry: RecentReadingEntry = {
  manga: {
    uuid: 'manga-1',
    displayTitle: '测试漫画',
    originalTitle: 'Manga',
    publishDate: null,
    cover: 0,
    createAt: '2026-07-01T00:00:00.000Z',
    updateAt: '2026-07-27T00:00:00.000Z',
  },
  pageCount: 10,
  pageIndex: 3,
  mode: 'paged',
  state: 'reading',
  hiddenFromRecent: false,
  updatedAt: '2026-07-28T12:00:00.000Z',
}

describe('RecentReadingSection', () => {
  it('shows progress, mode and last-read date and continues in one tap', () => {
    const onContinue = jest.fn()
    render(
      <RecentReadingSection
        api={{ url: jest.fn(), authorizationHeaders: jest.fn() } as unknown as ApiClient}
        entries={[entry]}
        onContinue={onContinue}
        serverUrl="https://example.com"
        userUuid="user-1"
      />,
    )

    expect(screen.getByText('第 4 / 10 页')).toBeOnTheScreen()
    expect(screen.getByText('翻页 · 07.28')).toBeOnTheScreen()
    expect(screen.getByLabelText('阅读进度 40%')).toBeOnTheScreen()
    fireEvent.press(screen.getByLabelText('继续阅读 测试漫画'))
    expect(onContinue).toHaveBeenCalledWith(entry)
  })

  it('renders an explicit completed state', () => {
    render(
      <RecentReadingSection
        api={{ url: jest.fn(), authorizationHeaders: jest.fn() } as unknown as ApiClient}
        entries={[{ ...entry, pageIndex: 9, state: 'completed' }]}
        onContinue={jest.fn()}
        serverUrl="https://example.com"
        userUuid="user-1"
      />,
    )

    expect(screen.getByText('已完成')).toBeOnTheScreen()
    expect(screen.getByLabelText('阅读进度 100%')).toBeOnTheScreen()
  })

  it('does not occupy library space without history', () => {
    const view = render(
      <RecentReadingSection
        api={{} as ApiClient}
        entries={[]}
        onContinue={jest.fn()}
        serverUrl="https://example.com"
        userUuid="user-1"
      />,
    )
    expect(view.toJSON()).toBeNull()
  })
})
