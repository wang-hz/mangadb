import { ArrowLeftOutlined, LeftOutlined, RightOutlined, StarFilled, StarOutlined } from '@ant-design/icons'
import { useDrag } from '@use-gesture/react'
import { Button, InputNumber, message, Popconfirm, Segmented, Spin } from 'antd'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import type { Manga } from '../types'

const IMG_FALLBACK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 2 3'%3E%3Crect fill='%23282828' width='2' height='3'/%3E%3C/svg%3E"

const onImgError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.onerror = null
  e.currentTarget.src = IMG_FALLBACK
}

type Mode = 'flip' | 'scroll'

export default function ReaderPage() {
  const { uuid } = useParams<{ uuid: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()

  const [manga, setManga] = useState<Manga | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingCover, setSavingCover] = useState(false)

  const mode = (searchParams.get('mode') === 'scroll' ? 'scroll' : 'flip') as Mode
  const currentPage = Math.max(0, parseInt(searchParams.get('page') ?? '0') || 0)
  const totalPages = manga?.pages.length ?? 0
  const coverPage = manga?.cover ?? 0

  useEffect(() => {
    if (!uuid) return
    api.getManga(uuid)
      .then(m => { setManga(m); setLoading(false) })
      .catch(() => { message.error(t('reader.loadError')); navigate(`/mangas/${uuid}`, { replace: true }) })
  }, [uuid])

  const goToPage = (p: number) => {
    const clamped = Math.max(0, Math.min(totalPages - 1, p))
    setSearchParams(prev => { prev.set('page', String(clamped)); return prev }, { replace: true })
  }

  const handleSetCover = async (pageIndex: number) => {
    if (!uuid || !manga) return
    setSavingCover(true)
    try {
      await api.updateManga(uuid, { cover: pageIndex })
      setManga(prev => prev ? { ...prev, cover: pageIndex } : prev)
      message.success(t('reader.setCoverSuccess', { page: pageIndex + 1 }))
    } catch {
      message.error(t('reader.setCoverError'))
    } finally {
      setSavingCover(false)
    }
  }

  useEffect(() => {
    if (!manga) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { navigate(`/mangas/${uuid}`, { replace: true }); return }
      if (mode !== 'flip') return
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); if (currentPage > 0) goToPage(currentPage - 1) }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); if (currentPage < totalPages - 1) goToPage(currentPage + 1) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [manga, mode, currentPage, totalPages])

  const hasPrev = currentPage > 0
  const hasNext = currentPage < totalPages - 1
  const bindSwipe = useDrag(({ swipe: [swipeX] }) => {
    if (swipeX === -1 && hasNext) goToPage(currentPage + 1)
    if (swipeX === 1 && hasPrev) goToPage(currentPage - 1)
  }, { axis: 'x', swipe: { distance: 50, velocity: [0.3, 0.3] } })

  if (loading) {
    return (
      <div style={{ height: '100vh', background: '#141414', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    )
  }

  const isCover = currentPage === coverPage

  const topBar = (
    <div style={{ flexShrink: 0, height: 48, background: 'rgba(0,0,0,0.92)', borderBottom: '1px solid #2a2a2a', display: 'flex', alignItems: 'center', padding: '0 12px', gap: 12 }}>
      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(`/mangas/${uuid}`, { replace: true })} style={{ color: '#ccc', flexShrink: 0 }} />
      <span style={{ color: '#aaa', flex: 1, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {manga?.displayTitle}
      </span>
      <Segmented
        value={mode}
        onChange={v => setSearchParams(prev => { prev.set('mode', v as string); return prev }, { replace: true })}
        options={[{ value: 'flip', label: t('reader.flip') }, { value: 'scroll', label: t('reader.scroll') }]}
        size="small"
        style={{ flexShrink: 0 }}
      />
    </div>
  )

  if (mode === 'flip') {
    return (
      <div style={{ height: '100vh', background: '#141414', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {topBar}
        <div
          {...bindSwipe()}
          style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', cursor: 'pointer', userSelect: 'none', touchAction: 'pan-y' }}
          onClick={e => {
            const { left, width } = e.currentTarget.getBoundingClientRect()
            if (e.clientX - left < width / 2) { if (hasPrev) goToPage(currentPage - 1) }
            else { if (hasNext) goToPage(currentPage + 1) }
          }}
        >
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '12%', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', padding: '0 8px', opacity: hasPrev ? 0.25 : 0, pointerEvents: 'none', transition: 'opacity 0.2s' }}>
            <LeftOutlined style={{ color: '#fff', fontSize: 28 }} />
          </div>
          <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '12%', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 8px', opacity: hasNext ? 0.25 : 0, pointerEvents: 'none', transition: 'opacity 0.2s' }}>
            <RightOutlined style={{ color: '#fff', fontSize: 28 }} />
          </div>
          <img
            key={currentPage}
            src={`/api/file/mangas/${uuid}/pages/${currentPage}`}
            alt={`${t('reader.pageLabel')} ${currentPage + 1}`}
            style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', display: 'block' }}
            onError={onImgError}
          />
        </div>
        <div style={{ flexShrink: 0, height: 48, background: 'rgba(0,0,0,0.92)', borderTop: '1px solid #2a2a2a', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Button type="text" icon={<LeftOutlined />} disabled={!hasPrev} onClick={() => goToPage(currentPage - 1)} style={{ color: hasPrev ? '#ccc' : '#444' }}>
            {t('reader.prevPage')}
          </Button>
          <span style={{ color: '#666', fontSize: 13 }}>{t('reader.pageLabel')}</span>
          <InputNumber
            value={currentPage + 1}
            min={1}
            max={totalPages}
            size="small"
            controls={false}
            style={{ width: 56, textAlign: 'center' }}
            onChange={v => { if (v != null) goToPage(v - 1) }}
          />
          <span style={{ color: '#666', fontSize: 13 }}>/ {totalPages} {t('reader.pageUnit')}</span>
          <Popconfirm
            title={t('reader.setCoverConfirm', { page: currentPage + 1 })}
            onConfirm={() => handleSetCover(currentPage)}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
            disabled={isCover || savingCover}
            placement="top"
          >
            <Button type="text" icon={isCover ? <StarFilled /> : <StarOutlined />} disabled={isCover} loading={savingCover} style={{ color: isCover ? '#faad14' : '#888' }}>
              {isCover ? t('reader.currentCover') : t('reader.setCover')}
            </Button>
          </Popconfirm>
          <Button type="text" disabled={!hasNext} onClick={() => goToPage(currentPage + 1)} style={{ color: hasNext ? '#ccc' : '#444' }}>
            {t('reader.nextPage')} <RightOutlined />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: '100vh', background: '#141414', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {topBar}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {manga?.pages.map((_, i) => (
          <div key={i} style={{ width: '100%', maxWidth: 800 }}>
            <img
              src={`/api/file/mangas/${uuid}/pages/${i}`}
              alt={`${t('reader.pageLabel')} ${i + 1}`}
              loading="lazy"
              style={{ width: '100%', display: 'block' }}
              onError={onImgError}
            />
            <div style={{ textAlign: 'center', padding: '2px 0', fontSize: 11, color: '#3a3a3a', background: '#141414' }}>
              {i + 1}
            </div>
          </div>
        ))}
        <div style={{ height: 32 }} />
      </div>
    </div>
  )
}
