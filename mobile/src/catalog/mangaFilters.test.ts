import { DEFAULT_CATALOG_FILTERS } from '@/storage/catalogFilters'
import type { RecentReadingEntry } from '@/storage/progress'
import { matchesLocalMangaFilters } from './mangaFilters'

const reading = {
  manga: { uuid: 'manga-1' },
  state: 'reading',
} as RecentReadingEntry
const completed = { ...reading, state: 'completed' } as RecentReadingEntry

describe('local manga filters', () => {
  it('combines reading, favorite, and downloaded states', () => {
    const filters = {
      ...DEFAULT_CATALOG_FILTERS,
      readingState: 'reading' as const,
      favoriteOnly: true,
      downloadedOnly: true,
    }
    expect(matchesLocalMangaFilters('manga-1', filters, reading, true, true)).toBe(true)
    expect(matchesLocalMangaFilters('manga-1', filters, completed, true, true)).toBe(false)
    expect(matchesLocalMangaFilters('manga-1', filters, reading, false, true)).toBe(false)
    expect(matchesLocalMangaFilters('manga-1', filters, reading, true, false)).toBe(false)
  })

  it('treats missing progress as unread', () => {
    const filters = { ...DEFAULT_CATALOG_FILTERS, readingState: 'unread' as const }
    expect(matchesLocalMangaFilters('manga-1', filters, undefined, false, false)).toBe(true)
    expect(matchesLocalMangaFilters('manga-1', filters, reading, false, false)).toBe(false)
  })
})
