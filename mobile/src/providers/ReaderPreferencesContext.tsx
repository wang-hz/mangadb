import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  DEFAULT_READER_PREFERENCES,
  loadReaderPreferences,
  type ReaderPreferences,
  saveReaderPreferences,
} from '@/storage/readerPreferences'

interface ReaderPreferencesContextValue {
  preferences: ReaderPreferences
  status: 'loading' | 'ready'
  updatePreferences: (patch: Partial<ReaderPreferences>) => Promise<void>
}

const ReaderPreferencesContext = createContext<ReaderPreferencesContextValue | null>(null)

export function ReaderPreferencesProvider({ children }: PropsWithChildren) {
  const [preferences, setPreferences] = useState<ReaderPreferences>(DEFAULT_READER_PREFERENCES)
  const [status, setStatus] = useState<'loading' | 'ready'>('loading')
  const preferencesRef = useRef(preferences)
  const persistedRef = useRef(preferences)

  useEffect(() => {
    let active = true
    loadReaderPreferences()
      .catch(() => ({ ...DEFAULT_READER_PREFERENCES }))
      .then(stored => {
        if (!active) return
        preferencesRef.current = stored
        persistedRef.current = stored
        setPreferences(stored)
        setStatus('ready')
      })
    return () => { active = false }
  }, [])

  const updatePreferences = useCallback(async (patch: Partial<ReaderPreferences>) => {
    const next = { ...preferencesRef.current, ...patch }
    preferencesRef.current = next
    setPreferences(next)
    try {
      const saved = await saveReaderPreferences(next)
      persistedRef.current = saved
      if (preferencesRef.current === next && saved !== next) {
        preferencesRef.current = saved
        setPreferences(saved)
      }
    } catch (error) {
      if (preferencesRef.current === next) {
        preferencesRef.current = persistedRef.current
        setPreferences(persistedRef.current)
      }
      throw error
    }
  }, [])

  const value = useMemo<ReaderPreferencesContextValue>(() => ({
    preferences,
    status,
    updatePreferences,
  }), [preferences, status, updatePreferences])

  return (
    <ReaderPreferencesContext.Provider value={value}>
      {children}
    </ReaderPreferencesContext.Provider>
  )
}

export function useReaderPreferences(): ReaderPreferencesContextValue {
  const context = useContext(ReaderPreferencesContext)
  if (!context) {
    throw new Error('useReaderPreferences must be used inside ReaderPreferencesProvider')
  }
  return context
}
