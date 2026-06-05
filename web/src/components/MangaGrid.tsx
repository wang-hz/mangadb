import { Card, Empty, Spin } from 'antd'
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
  fontSize: 12,
  lineHeight: '1.5',
  overflow: 'hidden',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
} as React.CSSProperties

const coverContainerStyle = { aspectRatio: '2/3', overflow: 'hidden', background: '#f5f5f5' } as const
const coverImgStyle = { width: '100%', height: '100%', objectFit: 'cover' as const, borderRadius: 0 }
const cardBodyStyle = { body: { padding: '8px 10px' } }

interface CardProps {
  manga: Manga
  from?: string
}

const MangaCard = memo(function MangaCard({ manga, from }: CardProps) {
  const navigate = useNavigate()
  const handleClick = useCallback(
    () => navigate(`/mangas/${manga.uuid}`, from ? { state: { from } } : undefined),
    [navigate, manga.uuid, from],
  )

  return (
    <Card
      hoverable
      cover={
        <div style={coverContainerStyle}>
          <CoverImage uuid={manga.uuid} cover={manga.cover} style={coverImgStyle} />
        </div>
      }
      styles={cardBodyStyle}
      onClick={handleClick}
    >
      <div style={titleStyle}>{manga.displayTitle}</div>
      {manga.publishDate && (
        <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
          {formatDate(manga.publishDate)}
        </div>
      )}
    </Card>
  )
})

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
  gap: 12,
  minHeight: 200,
} as const

export default function MangaGrid({ data, loading, from }: Props) {
  return (
    <Spin spinning={loading}>
      {!loading && data.length === 0 ? (
        <Empty description="暂无漫画" style={{ padding: '48px 0' }} />
      ) : (
        <div style={gridStyle}>
          {data.map(manga => (
            <MangaCard key={manga.uuid} manga={manga} from={from} />
          ))}
        </div>
      )}
    </Spin>
  )
}