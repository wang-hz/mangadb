import { Empty } from 'antd'
import { memo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Manga } from '../types'
import { formatDate } from '../utils/date'
import CoverImage from './CoverImage'

interface Props {
  data: Manga[]
  loading: boolean
  from?: string
}

// Style for 2-line title clamp; cast required because WebkitBoxOrient is
// not in React's CSSProperties typings.
const titleStyle = {
  fontSize: 14,
  lineHeight: '1.5',
  overflow: 'hidden',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
} as React.CSSProperties

const coverContainerStyle = { aspectRatio: '2/3', overflow: 'hidden', background: '#f5f5f5', borderRadius: '8px 8px 0 0' } as const
const coverImgStyle = { width: '100%', height: '100%', objectFit: 'cover' as const, borderRadius: 0 }
const dateStyle = { fontSize: 12, color: '#999', marginTop: 2 } as const
const gridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
  gap: 12,
  minHeight: 200,
} as const

interface CardProps {
  manga: Manga
  onNavigate: (uuid: string) => void
}

const MangaCard = memo(function MangaCard({ manga, onNavigate }: CardProps) {
  const handleClick = useCallback(() => onNavigate(manga.uuid), [onNavigate, manga.uuid])

  return (
    <div className="manga-card" onClick={handleClick}>
      <div style={coverContainerStyle}>
        <CoverImage uuid={manga.uuid} cover={manga.cover} thumb style={coverImgStyle} />
      </div>
      <div style={{ padding: '8px 10px' }}>
        <div style={titleStyle}>{manga.displayTitle}</div>
        {manga.publishDate && (
          <div style={dateStyle}>{formatDate(manga.publishDate)}</div>
        )}
      </div>
    </div>
  )
})

export default function MangaGrid({ data, loading, from }: Props) {
  const navigate = useNavigate()

  const handleNavigate = useCallback(
    (uuid: string) => navigate(`/mangas/${uuid}`, from ? { state: { from } } : undefined),
    [navigate, from],
  )

  if (loading) return <div style={{ minHeight: 200 }} />

  if (data.length === 0) return <Empty description="暂无漫画" style={{ padding: '48px 0' }} />

  return (
    <div style={gridStyle}>
      {data.map(manga => (
        <MangaCard key={manga.uuid} manga={manga} onNavigate={handleNavigate} />
      ))}
    </div>
  )
}
