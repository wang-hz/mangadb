import { Tag } from 'antd'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import type { RemoteProgress } from '../../../mobile/src/sync/protocol'

interface Props {
  entry?: RemoteProgress
  pageCount: number
  style?: CSSProperties
}

export default function ReadingProgressTag({ entry, pageCount, style }: Props) {
  const { t } = useTranslation()
  const exists = entry && !entry.deleted
  const currentPage = exists ? Math.max(0, Math.min(entry.pageIndex + 1, pageCount)) : 0

  return (
    <Tag color={exists ? entry.state === 'completed' ? 'green' : 'blue' : undefined} style={style}>
      {t(exists ? entry.state === 'completed' ? 'progress.completed' : 'progress.reading' : 'progress.unread')}
      {` · ${currentPage}/${pageCount}`}
    </Tag>
  )
}
