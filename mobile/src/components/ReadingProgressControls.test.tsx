import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import {
  markMangaCompleted,
  markMangaUnread,
  removeFromRecentReading,
  type ReadingProgress,
} from '@/storage/progress'
import { ReadingProgressControls } from './ReadingProgressControls'

jest.mock('@/storage/progress', () => ({
  markMangaCompleted: jest.fn(),
  markMangaUnread: jest.fn(),
  removeFromRecentReading: jest.fn(),
}))

const manga = {
  uuid: 'manga-1',
  displayTitle: '测试漫画',
  originalTitle: 'Manga',
  publishDate: null,
  cover: 0,
  createAt: '2026-07-01T00:00:00.000Z',
  updateAt: '2026-07-27T00:00:00.000Z',
}
const progress: ReadingProgress = {
  pageIndex: 3,
  mode: 'paged',
  state: 'reading',
  updatedAt: '2026-07-28T00:00:00.000Z',
}

describe('ReadingProgressControls', () => {
  beforeEach(() => {
    jest.mocked(markMangaUnread).mockResolvedValue(undefined)
    jest.mocked(removeFromRecentReading).mockResolvedValue(undefined)
    jest.mocked(markMangaCompleted).mockResolvedValue({
      ...progress,
      manga,
      pageCount: 10,
      pageIndex: 9,
      state: 'completed',
      hiddenFromRecent: false,
    })
  })

  it('marks reading progress complete and updates the caller immediately', async () => {
    const onChange = jest.fn()
    renderControls(progress, onChange)

    fireEvent.press(screen.getByText('标记已完成'))

    await waitFor(() => expect(markMangaCompleted).toHaveBeenCalledWith(
      'https://example.com',
      'user-1',
      manga,
      10,
      'paged',
    ))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ state: 'completed' }))
  })

  it('marks a manga unread and clears visible progress', async () => {
    const onChange = jest.fn()
    renderControls(progress, onChange)

    fireEvent.press(screen.getByText('标记未读'))

    await waitFor(() => expect(markMangaUnread).toHaveBeenCalledWith(
      'https://example.com',
      'user-1',
      'manga-1',
    ))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('removes recent history without clearing the reading position', async () => {
    const onChange = jest.fn()
    renderControls(progress, onChange)

    fireEvent.press(screen.getByText('移出最近阅读'))

    await waitFor(() => expect(removeFromRecentReading).toHaveBeenCalled())
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText('已移出最近阅读，阅读位置仍保留')).toBeOnTheScreen()
  })
})

function renderControls(value: ReadingProgress | null, onChange = jest.fn()) {
  return render(
    <ReadingProgressControls
      manga={manga}
      onChange={onChange}
      pageCount={10}
      progress={value}
      serverUrl="https://example.com"
      userUuid="user-1"
    />,
  )
}
