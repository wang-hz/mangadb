import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import type { Manga } from '../types'
import { useProgress } from './ProgressProvider'
import { clampReaderPage, resolveReaderPosition } from './reader'

export function useReaderProgress(manga: Manga | null) {
  const { store, sync } = useProgress()
  const [params, setParams] = useSearchParams()
  const { uuid } = useParams()
  const initialParams = useRef({ uuid, params })
  if (initialParams.current.uuid !== uuid) initialParams.current = { uuid, params }
  const [readingRun, setReadingRun] = useState(0)
  const [restored, setRestored] = useState<{ uuid: string; page: number; mode: 'flip' | 'scroll'; completed: boolean } | null>(null)
  const [error, setError] = useState(false)
  const latest = useRef(restored)
  if (!latest.current || latest.current.uuid !== restored?.uuid) latest.current = restored
  const ready = Boolean(manga && restored?.uuid === manga.uuid)

  useEffect(() => {
    if (!manga) return
    let active = true
    let timer: ReturnType<typeof setTimeout>
    setError(false)
    const restore = async () => {
      await Promise.race([sync(true), new Promise<void>(resolve => { timer = setTimeout(resolve, 1200) })])
      clearTimeout(timer!)
      const state = await store.read()
      if (!active) return
      const saved = state.records[manga.uuid]
      const position = resolveReaderPosition(initialParams.current.params, saved, manga.pages.length)
      const completed = manga.pages.length > 0 && position.page === manga.pages.length - 1
      const next = { uuid: manga.uuid, ...position, completed }
      latest.current = next
      setRestored(next)
      // Opening a manga counts as a reading visit, and unhides it from recent.
      await store.write(manga, manga.pages.length, {
        pageIndex: position.page, mode: position.mode === 'flip' ? 'paged' : 'scroll',
        state: completed ? 'completed' : 'reading',
      })
    }
    void restore().catch(() => { if (active) setError(true) })
    return () => { active = false; clearTimeout(timer!); void sync(true) }
  }, [manga?.uuid, store, sync])

  const change = useCallback((page: number, mode: 'flip' | 'scroll', restart = false) => {
    if (!manga || latest.current?.uuid !== manga.uuid) return
    const clamped = clampReaderPage(page, manga.pages.length)
    const previous = latest.current
    if (!restart && previous.page === clamped && previous.mode === mode) return
    const completed = !restart && manga.pages.length > 0 && clamped === manga.pages.length - 1
      && (previous.page !== clamped || previous.completed)
    const next = { uuid: manga.uuid, page: clamped, mode, completed }
    latest.current = next
    void store.write(manga, manga.pages.length, {
      pageIndex: clamped, mode: mode === 'flip' ? 'paged' : 'scroll', state: completed ? 'completed' : 'reading',
    }).then(() => {
      if (latest.current !== next) return
      setRestored(next)
      if (restart) setReadingRun(value => value + 1)
      setParams(previous => {
        previous.set('page', String(clamped)); previous.set('mode', mode)
        return previous
      }, { replace: true })
      setError(false)
    }).catch(() => { if (latest.current === next) setError(true) })
  }, [manga, store, setParams])
  return {
    readingRun, ready, error, mode: restored?.mode ?? 'flip', currentPage: restored?.page ?? 0,
    completed: ready && Boolean(restored?.completed),
    goToPage: (page: number) => change(page, latest.current?.mode ?? 'flip'),
    changeMode: (mode: 'flip' | 'scroll') => change(latest.current?.page ?? 0, mode),
    restart: () => change(0, latest.current?.mode ?? 'flip', true),
  }
}
