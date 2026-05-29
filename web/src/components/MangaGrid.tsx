import { Card, Empty, Spin } from 'antd'
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

export default function MangaGrid({ data, loading, from }: Props) {
  const navigate = useNavigate()

  return (
    <Spin spinning={loading}>
      {!loading && data.length === 0 ? (
        <Empty description="暂无漫画" style={{ padding: '48px 0' }} />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: 12,
            minHeight: 200,
          }}
        >
          {data.map(manga => (
            <Card
              key={manga.uuid}
              hoverable
              cover={
                <div style={{ aspectRatio: '2/3', overflow: 'hidden', background: '#f5f5f5' }}>
                  <CoverImage
                    uuid={manga.uuid}
                    cover={manga.cover}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 0 }}
                  />
                </div>
              }
              styles={{ body: { padding: '8px 10px' } }}
              onClick={() => navigate(`/mangas/${manga.uuid}`, from ? { state: { from } } : undefined)}
            >
              <div style={titleStyle}>{manga.displayTitle}</div>
              {manga.publishDate && (
                <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                  {formatDate(manga.publishDate)}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </Spin>
  )
}