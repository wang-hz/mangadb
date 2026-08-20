import type { CatalogFilters } from '@/storage/catalogFilters'
import type { ReadingProgressEntry } from '@/storage/progress'

export function matchesLocalMangaFilters(
  mangaUuid: string,
  filters: CatalogFilters,
  progress: Pick<ReadingProgressEntry, 'state'> | undefined,
  favorite: boolean,
  downloaded: boolean,
) {
  if (filters.readingState === 'unread' && progress) return false
  if (filters.readingState === 'reading' && progress?.state !== 'reading') return false
  if (filters.readingState === 'completed' && progress?.state !== 'completed') return false
  if (filters.favoriteOnly && !favorite) return false
  if (filters.downloadedOnly && !downloaded) return false
  return true
}
