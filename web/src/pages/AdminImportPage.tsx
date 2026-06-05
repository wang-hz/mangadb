import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CloseOutlined,
  FileZipOutlined,
  FolderOpenOutlined,
  LoadingOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Collapse,
  DatePicker,
  Empty,
  Form,
  Input,
  Progress,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from 'antd'
import dayjs from 'dayjs'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import type { ImportResult, PendingTagInput } from '../api/import'
import { uploadImages, uploadZip } from '../api/import'
import type { Tag as TagData, TagType } from '../types'
import { parseFilename, stripArchiveExtension } from '../utils/importParser'

const { Text } = Typography

interface FormState {
  displayTitle: string
  originalTitle: string
  publishDate: dayjs.Dayjs | null
}

interface PendingTag {
  id: string
  tagTypeName: string
  name: string
}

type TagListItem =
  | { kind: 'existing'; tag: TagData }
  | { kind: 'pending'; data: PendingTag }

type ImportStatus = 'pending' | 'uploading' | 'done' | 'error'

interface ImportItem {
  id: string
  kind: 'zip' | 'folder'
  file?: File
  folderFiles?: File[]
  fullname: string
  form: FormState
  tagItems: TagListItem[]
  status: ImportStatus
  progress: number
  result?: ImportResult
  errorMsg?: string
}

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)$/i

function uid() { return Math.random().toString(36).slice(2) }

function applyParsed(name: string): { form: FormState; initialTags: TagListItem[] } {
  const p = parseFilename(name)
  const pending = (typeName: string, value: string | null): TagListItem[] =>
    value ? [{ kind: 'pending', data: { id: uid(), tagTypeName: typeName, name: value } }] : []
  return {
    form: { displayTitle: p.displayTitle, originalTitle: p.originalTitle, publishDate: p.publishDate ? dayjs(p.publishDate) : null },
    initialTags: [
      ...pending('group', p.group),
      ...pending('artist', p.artist),
      ...pending('event', p.event),
      ...pending('parody', p.parody),
      ...p.tags.map(tg => ({ kind: 'pending' as const, data: { id: uid(), tagTypeName: '', name: tg } })),
    ],
  }
}

function extractUploadTags(items: TagListItem[]): { tagUuids: string[]; pendingTags: PendingTagInput[] } {
  return {
    tagUuids: items.filter((i): i is Extract<TagListItem, { kind: 'existing' }> => i.kind === 'existing').map(i => i.tag.uuid),
    pendingTags: items
      .filter((i): i is Extract<TagListItem, { kind: 'pending' }> => i.kind === 'pending')
      .map(i => i.data).filter(d => d.name.trim())
      .map(d => ({ name: d.name.trim(), tagTypeName: d.tagTypeName.trim() || 'other' })),
  }
}

function makeZipItem(file: File): ImportItem {
  const name = stripArchiveExtension(file.name)
  const { form, initialTags } = applyParsed(name)
  return { id: uid(), kind: 'zip', file, fullname: name, form, tagItems: initialTags, status: 'pending', progress: 0 }
}

function makeFolderItem(name: string, images: File[]): ImportItem {
  const { form, initialTags } = applyParsed(name)
  return { id: uid(), kind: 'folder', folderFiles: images, fullname: name, form, tagItems: initialTags, status: 'pending', progress: 0 }
}

function TagsSection({ items, onChange, tagTypes }: { items: TagListItem[]; onChange: (items: TagListItem[]) => void; tagTypes: TagType[] }) {
  const { t } = useTranslation()
  const [tagSearch, setTagSearch] = useState('')
  const [tagOptions, setTagOptions] = useState<TagData[]>([])
  const [selectedUuids, setSelectedUuids] = useState<string[]>([])

  useEffect(() => {
    api.getTags({ page: 1, limit: 50, search: tagSearch || undefined })
      .then(r => setTagOptions(r.items)).catch(() => {})
  }, [tagSearch])

  const existingUuids = new Set(
    items.filter((i): i is Extract<TagListItem, { kind: 'existing' }> => i.kind === 'existing').map(i => i.tag.uuid)
  )
  const typeOptions = tagTypes.map(tt => ({ value: tt.name, label: tt.name }))

  function resolveTypeName(name: string) {
    if (!name) return undefined
    return tagTypes.find(tt => tt.name.toLowerCase() === name.toLowerCase())?.name ?? name
  }
  function remove(idx: number) { onChange(items.filter((_, i) => i !== idx)) }
  function updatePending(idx: number, patch: Partial<PendingTag>) {
    onChange(items.map((item, i) =>
      i !== idx || item.kind !== 'pending' ? item : { kind: 'pending', data: { ...item.data, ...patch } }
    ))
  }
  function addExisting() {
    if (!selectedUuids.length) return
    const toAdd = tagOptions.filter(tg => selectedUuids.includes(tg.uuid) && !existingUuids.has(tg.uuid)).map(tg => ({ kind: 'existing' as const, tag: tg }))
    onChange([...items, ...toAdd])
    setSelectedUuids([]); setTagSearch('')
  }

  const rowStyle: React.CSSProperties = { display: 'flex', gap: 6, alignItems: 'center' }

  return (
    <Form.Item label={t('manga.tags')} style={{ marginBottom: 0 }}>
      <Space direction="vertical" style={{ width: '100%' }} size={4}>
        {items.map((item, i) =>
          item.kind === 'existing' ? (
            <div key={item.tag.uuid} style={rowStyle}>
              <Tag color="blue" style={{ margin: 0 }}>{item.tag.tagType.name}: {item.tag.name}</Tag>
              <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => remove(i)} />
            </div>
          ) : (
            <div key={item.data.id} style={rowStyle}>
              <Select size="small" style={{ width: 120, flexShrink: 0 }} placeholder={t('import.tagType')}
                value={resolveTypeName(item.data.tagTypeName)} onChange={v => updatePending(i, { tagTypeName: v })}
                options={typeOptions} showSearch />
              <Input size="small" value={item.data.name} style={{ flex: 1 }} placeholder={t('import.tagName')}
                onChange={e => updatePending(i, { name: e.target.value })} />
              <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => remove(i)} />
            </div>
          )
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          <Select mode="multiple" style={{ flex: 1 }} placeholder={t('import.searchTags')}
            value={selectedUuids} onChange={uuids => { setSelectedUuids(uuids); setTagSearch('') }}
            onSearch={setTagSearch} searchValue={tagSearch} filterOption={false} showSearch
            options={tagOptions.filter(tg => !existingUuids.has(tg.uuid)).map(tg => ({ value: tg.uuid, label: `${tg.tagType.name}: ${tg.name}` }))} />
          <Button onClick={addExisting} disabled={!selectedUuids.length}>{t('common.add')}</Button>
        </div>
        <Button size="small" type="dashed" icon={<PlusOutlined />}
          onClick={() => onChange([...items, { kind: 'pending', data: { id: uid(), tagTypeName: '', name: '' } }])}>
          {t('import.newTag')}
        </Button>
      </Space>
    </Form.Item>
  )
}

function ItemHeader({ item, onRemove }: { item: ImportItem; onRemove: () => void }) {
  const { t } = useTranslation()
  const STATUS_ICON: Record<ImportStatus, React.ReactNode> = {
    pending: <Tag style={{ margin: 0 }}>{t('import.pending')}</Tag>,
    uploading: <LoadingOutlined style={{ color: '#1677ff' }} />,
    done: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
    error: <CloseCircleOutlined style={{ color: '#ff4d4f' }} />,
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
      {item.kind === 'zip' ? <FileZipOutlined /> : <FolderOpenOutlined />}
      <Text style={{ flex: 1, minWidth: 0 }} ellipsis>{item.fullname}</Text>
      {STATUS_ICON[item.status]}
      {item.status !== 'uploading' && item.status !== 'done' && (
        <Button size="small" type="text" icon={<CloseOutlined />} onClick={e => { e.stopPropagation(); onRemove() }} />
      )}
    </div>
  )
}

function ItemBody({ item, tagTypes, onFormChange, onTagsChange, onFullnameChange }: {
  item: ImportItem; tagTypes: TagType[]
  onFormChange: (form: FormState) => void
  onTagsChange: (tags: TagListItem[]) => void
  onFullnameChange: (fullname: string) => void
}) {
  const { t } = useTranslation()
  const disabled = item.status === 'uploading' || item.status === 'done'
  const { form } = item

  if (item.status === 'done' && item.result) {
    return <Alert type="success" message={t('import.successResult', { title: item.result.displayTitle, pages: item.result.pageCount })} showIcon />
  }
  if (item.status === 'error') {
    return <Alert type="error" message={item.errorMsg ?? t('import.errorResult')} showIcon />
  }

  return (
    <Form layout="vertical" size="small">
      <Form.Item label={t('manga.fullname')} style={{ marginBottom: 8 }}>
        <Input value={item.fullname} disabled={disabled} onChange={e => onFullnameChange(e.target.value)} />
      </Form.Item>
      <Form.Item label={t('manga.displayTitle')} required style={{ marginBottom: 8 }}>
        <Input value={form.displayTitle} disabled={disabled} onChange={e => onFormChange({ ...form, displayTitle: e.target.value })} />
      </Form.Item>
      <Form.Item label={t('manga.originalTitle')} style={{ marginBottom: 8 }}>
        <Input value={form.originalTitle} disabled={disabled} onChange={e => onFormChange({ ...form, originalTitle: e.target.value })} />
      </Form.Item>
      <Form.Item label={t('manga.publishDate')} style={{ marginBottom: 12 }}>
        <DatePicker value={form.publishDate} disabled={disabled} style={{ width: '100%' }} onChange={v => onFormChange({ ...form, publishDate: v })} />
      </Form.Item>
      <TagsSection items={item.tagItems} onChange={onTagsChange} tagTypes={tagTypes} />
      {item.status === 'uploading' && <Progress percent={item.progress} size="small" style={{ marginTop: 8, marginBottom: 0 }} />}
    </Form>
  )
}

export default function AdminImportPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const zipInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const [tagTypes, setTagTypes] = useState<TagType[]>([])
  const [items, setItems] = useState<ImportItem[]>([])
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    api.getTagTypes({ page: 1, limit: 100 }).then(r => setTagTypes(r.items)).catch(() => {})
  }, [])

  function addItems(newItems: ImportItem[]) { setItems(prev => [...prev, ...newItems]) }
  function updateItem(id: string, patch: Partial<ImportItem>) { setItems(prev => prev.map(item => item.id === id ? { ...item, ...patch } : item)) }
  function removeItem(id: string) { setItems(prev => prev.filter(item => item.id !== id)) }

  function handleZipInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    addItems(files.map(makeZipItem))
    e.target.value = ''
  }

  function handleFolderInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    const images = files.filter(f => IMAGE_EXT.test(f.name))
    if (!images.length) { e.target.value = ''; return }
    const folderName = images[0].webkitRelativePath.split('/')[0] || images[0].name
    addItems([makeFolderItem(folderName, images)])
    e.target.value = ''
  }

  async function importAll() {
    const pending = items.filter(i => i.status === 'pending' && i.form.displayTitle.trim())
    if (!pending.length) { message.warning(t('import.noItemsWarning')); return }
    setImporting(true)

    for (const item of pending) {
      updateItem(item.id, { status: 'uploading', progress: 0 })
      const { tagUuids, pendingTags } = extractUploadTags(item.tagItems)
      const displayTitle = item.form.displayTitle.trim()
      const originalTitle = item.form.originalTitle.trim() || displayTitle
      const publishDate = item.form.publishDate?.format('YYYY-MM-DD') ?? null

      try {
        let result: ImportResult
        if (item.kind === 'zip' && item.file) {
          result = await uploadZip(item.file, item.fullname, displayTitle, originalTitle, publishDate, tagUuids, pendingTags, p => updateItem(item.id, { progress: p }))
        } else if (item.kind === 'folder' && item.folderFiles) {
          result = await uploadImages(item.folderFiles, item.fullname, displayTitle, originalTitle, publishDate, tagUuids, pendingTags, p => updateItem(item.id, { progress: p }))
        } else continue
        updateItem(item.id, { status: 'done', result })
      } catch (e: any) {
        updateItem(item.id, { status: 'error', errorMsg: e.message ?? t('import.errorResult') })
      }
    }

    setImporting(false)
    message.success(t('import.batchDone'))
  }

  function clearDone() { setItems(prev => prev.filter(i => i.status !== 'done')) }

  const pendingCount = items.filter(i => i.status === 'pending').length
  const doneCount = items.filter(i => i.status === 'done').length

  const collapseItems = items.map(item => ({
    key: item.id,
    label: <ItemHeader item={item} onRemove={() => removeItem(item.id)} />,
    children: (
      <ItemBody
        item={item}
        tagTypes={tagTypes}
        onFormChange={form => updateItem(item.id, { form })}
        onTagsChange={tagItems => updateItem(item.id, { tagItems })}
        onFullnameChange={fullname => updateItem(item.id, { fullname })}
      />
    ),
  }))

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0, flex: 1 }}>{t('import.title')}</h2>
        <Button icon={<FileZipOutlined />} onClick={() => zipInputRef.current?.click()}>{t('import.addZip')}</Button>
        <Button icon={<FolderOpenOutlined />} onClick={() => folderInputRef.current?.click()}>{t('import.addFolder')}</Button>
        {doneCount > 0 && <Button onClick={clearDone}>{t('import.clearDone', { count: doneCount })}</Button>}
        {items.some(i => i.result) && <Button onClick={() => navigate('/mangas')}>{t('import.goToList')}</Button>}
        <Button type="primary" loading={importing} disabled={!pendingCount} onClick={importAll}>
          {pendingCount > 0 ? t('import.importAllWithCount', { count: pendingCount }) : t('import.importAll')}
        </Button>
      </div>

      <input ref={zipInputRef} type="file" multiple accept=".zip,.cbz" style={{ display: 'none' }} onChange={handleZipInputChange} />
      <input ref={folderInputRef} type="file"
        // @ts-expect-error webkitdirectory is non-standard
        webkitdirectory="" multiple accept="image/*"
        style={{ display: 'none' }} onChange={handleFolderInputChange} />

      {items.length > 0 ? (
        <Collapse items={collapseItems} defaultActiveKey={items.map(i => i.id)} />
      ) : (
        <Empty description={t('import.noItems')} style={{ marginTop: 80 }} />
      )}
    </>
  )
}
