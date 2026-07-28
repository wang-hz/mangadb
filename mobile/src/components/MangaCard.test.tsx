import { render, screen } from '@testing-library/react-native'
import type { ApiClient } from '@/api/client'
import { MangaCard } from '@/components/MangaCard'
import { useDownloads } from '@/downloads/DownloadContext'
import { createDownloadManifest } from '@/downloads/types'

jest.mock('expo-image', () => ({ Image: () => null }))
jest.mock('@/downloads/DownloadContext', () => ({ useDownloads: jest.fn() }))

const manga = {
      uuid: 'manga-1',
      displayTitle: 'Manga',
      originalTitle: 'Manga',
      publishDate: null,
      cover: 0,
      createAt: '2026-07-01T00:00:00.000Z',
      updateAt: '2026-07-27T00:00:00.000Z',
}

describe('MangaCard states', () => {
  beforeEach(() => {
    jest.mocked(useDownloads).mockReturnValue({
      manifestFor: jest.fn().mockReturnValue(null),
    } as never)
  })

  it('shows completed offline state', () => {
    const manifest = createDownloadManifest({
      serverUrl: 'https://example.com',
      userUuid: 'user-1',
    }, {
      ...manga,
      fullname: 'manga',
      pages: ['0.jpg'],
      mangaTags: [],
    })
    manifest.state = 'completed'
    manifest.pages[0].state = 'completed'
    jest.mocked(useDownloads).mockReturnValue({
      manifestFor: jest.fn().mockReturnValue(manifest),
    } as never)

    render(
      <MangaCard
        api={{
          url: (path: string) => `https://example.com${path}`,
          authorizationHeaders: () => ({}),
        } as unknown as ApiClient}
        manga={manga}
        serverUrl="https://example.com"
        userUuid="user-1"
        width={160}
      />,
    )

    expect(screen.getByText('已下载')).toBeOnTheScreen()
    expect(screen.getByText('未开始')).toBeOnTheScreen()
  })

  it('shows reading progress and completed state', () => {
    const view = renderCard({
      manga,
      pageCount: 10,
      pageIndex: 3,
      mode: 'paged',
      state: 'reading',
      updatedAt: '2026-07-28T00:00:00.000Z',
      hiddenFromRecent: false,
    })
    expect(screen.getByText('阅读中 · 40%')).toBeOnTheScreen()

    view.rerender(renderCardElement({
      manga,
      pageCount: 10,
      pageIndex: 9,
      mode: 'paged',
      state: 'completed',
      updatedAt: '2026-07-28T00:00:00.000Z',
      hiddenFromRecent: false,
    }))
    expect(screen.getByText('已完成')).toBeOnTheScreen()
  })

  it('shows local favorite state', () => {
    render(renderCardElement(undefined, true))
    expect(screen.getByLabelText('已收藏')).toBeOnTheScreen()
  })
})

function renderCard(progress?: Parameters<typeof MangaCard>[0]['progress']) {
  return render(renderCardElement(progress))
}

function renderCardElement(
  progress?: Parameters<typeof MangaCard>[0]['progress'],
  favorite = false,
) {
  return (
    <MangaCard
      api={{
        url: (path: string) => `https://example.com${path}`,
        authorizationHeaders: () => ({}),
      } as unknown as ApiClient}
      manga={manga}
      favorite={favorite}
      progress={progress}
      serverUrl="https://example.com"
      userUuid="user-1"
      width={160}
    />
  )
}
