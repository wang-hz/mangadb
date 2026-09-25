import { useCallback, useEffect, useRef, useState } from 'react'
import type { MangaDetail } from '@/api/types'
import { markMangaCompleted, restartMangaReading } from '@/storage/progress'
import type { ReadingProgressWriter } from '@/storage/progressWriter'
import type { ReaderMode } from '@/utils/reader'

interface CompletionOptions {
  manga: MangaDetail
  serverUrl: string
  userUuid: string
  pageIndex: number
  mode: ReaderMode
  initialCompleted: boolean
  writer: ReadingProgressWriter
  onRestart: () => void
}

export function useReaderCompletion(options: CompletionOptions) {
  const latest = useRef(options)
  latest.current = options
  const [completed, setCompleted] = useState(options.initialCompleted)
  const completedRef = useRef(options.initialCompleted)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const flight = useRef<Promise<void> | null>(null)
  const restarting = useRef(false)
  const attempted = useRef(false)
  const visit = useRef({ pageIndex: options.pageIndex, count: options.manga.pages.length, revision: 0 })
  if (visit.current.pageIndex !== options.pageIndex || visit.current.count !== options.manga.pages.length) {
    visit.current = {
      pageIndex: options.pageIndex,
      count: options.manga.pages.length,
      revision: visit.current.revision + 1,
    }
    attempted.current = false
    completedRef.current = false
  }

  const complete = useCallback((): Promise<void> => {
    if (flight.current) return flight.current
    if (completedRef.current) return latest.current.writer.flush()
    const revision = visit.current.revision
    const operation = async () => {
      setPending(true)
      setError(null)
      try {
        const { writer } = latest.current
        // Drain earlier saves; the explicit state write supersedes even a failed position save.
        await writer.flush().catch(() => {})
        const { manga, pageIndex, serverUrl, userUuid, mode } = latest.current
        if (revision !== visit.current.revision || pageIndex !== manga.pages.length - 1) return
        await markMangaCompleted(serverUrl, userUuid, manga, manga.pages.length, mode)
        if (revision === visit.current.revision) {
          completedRef.current = true
          setCompleted(true)
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '无法保存完成状态')
        throw cause
      } finally {
        setPending(false)
        flight.current = null
      }
    }
    flight.current = operation()
    return flight.current
  }, [])

  useEffect(() => {
    const atEnd = options.manga.pages.length > 0 && options.pageIndex === options.manga.pages.length - 1
    if (!completedRef.current) setCompleted(false)
    if (!atEnd || attempted.current || restarting.current || flight.current) return
    attempted.current = true
    void complete().catch(() => {})
  }, [options.pageIndex, options.manga.pages.length, complete, pending])

  const reread = useCallback(async () => {
    if (restarting.current) return
    restarting.current = true
    setPending(true)
    setError(null)
    try {
      await flight.current?.catch(() => {})
      setPending(true)
      const { writer, manga, serverUrl, userUuid, mode, onRestart } = latest.current
      writer.cancel()
      await writer.flush().catch(() => {})
      await restartMangaReading(serverUrl, userUuid, manga, manga.pages.length, mode)
      completedRef.current = false
      setCompleted(false)
      setError(null)
      // A one-page reread must remain in progress until a new reading visit.
      attempted.current = true
      onRestart()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法保存重读位置')
      throw cause
    } finally {
      restarting.current = false
      setPending(false)
    }
  }, [])

  return { completed, pending, error, complete, reread, restarting }
}
