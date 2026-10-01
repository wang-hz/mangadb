import { Button, Empty, Space, Spin, Typography } from 'antd'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import CoverImage from '../components/CoverImage'
import ReadingProgressControls from '../components/ReadingProgressControls'
import { useProgress } from '../progress/ProgressProvider'

export default function RecentReadingPage() {
  const { records, ready, error } = useProgress()
  const { t } = useTranslation()
  if (error) return <div role="alert">{t('progress.storageError')}</div>
  if (!ready) return <Spin />
  const entries = Object.values(records).filter(entry => !entry.deleted && !entry.hiddenFromRecent)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 100)
  return <Space direction="vertical" size="large" style={{ width: '100%' }}>
    <Typography.Title level={3}>{t('progress.recent')}</Typography.Title>
    {!entries.length && <Empty description={t('progress.noRecent')} />}
    {entries.map(entry => <div key={entry.mangaUuid} style={{ display: 'flex', gap: 16, paddingBottom: 16, borderBottom: '1px solid #eee' }}>
      <Link to={`/mangas/${entry.mangaUuid}`} style={{ flexShrink: 0 }}>
        <CoverImage uuid={entry.mangaUuid} cover={entry.manga.cover} thumb style={{ width: 70, height: 100, objectFit: 'cover' }} />
      </Link>
      <Space direction="vertical" style={{ minWidth: 0 }}>
        <Link to={`/mangas/${entry.mangaUuid}`}>{entry.manga.displayTitle}</Link>
        <Button type="primary" size="small" href={`/mangas/${entry.mangaUuid}/read`}>{t('progress.continue')}</Button>
        <ReadingProgressControls manga={entry.manga} pageCount={entry.pageCount} recent />
      </Space>
    </div>)}
  </Space>
}
