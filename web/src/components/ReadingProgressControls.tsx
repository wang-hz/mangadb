import { Button, message, Space } from 'antd'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ProgressManga } from '../../../mobile/src/sync/protocol'
import { useProgress } from '../progress/ProgressProvider'
import ReadingProgressTag from './ReadingProgressTag'

export default function ReadingProgressControls({ manga, pageCount, recent = false }: { manga: ProgressManga; pageCount: number; recent?: boolean }) {
  const { records, store, sync, pending } = useProgress()
  const { t } = useTranslation()
  const [saving, setSaving] = useState(false)
  const entry = records[manga.uuid]
  const exists = entry && !entry.deleted
  const update = async (values: Parameters<typeof store.write>[2]) => {
    setSaving(true)
    try {
      await store.write(manga, pageCount, values)
      void sync(true)
    } catch { message.error(t('progress.storageError')) }
    finally { setSaving(false) }
  }
  return <Space wrap size="small">
    <ReadingProgressTag entry={entry} pageCount={pageCount} />
    {pending && <span style={{ fontSize: 12, color: '#888' }}>{t('progress.pending')}</span>}
    {pageCount > 0 && <Button size="small" disabled={saving} onClick={() => void update({ pageIndex: pageCount - 1, state: 'completed' })}>{t('progress.markCompleted')}</Button>}
    {exists && <>
      <Button size="small" disabled={saving} onClick={() => void update({ pageIndex: 0, state: 'reading' })}>{t('progress.restart')}</Button>
      <Button size="small" disabled={saving} onClick={() => void update({ deleted: true })}>{t('progress.markUnread')}</Button>
      {recent && <Button size="small" disabled={saving} onClick={() => void update({ hiddenFromRecent: true })}>{t('progress.removeRecent')}</Button>}
    </>}
  </Space>
}
