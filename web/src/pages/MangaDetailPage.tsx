import { ArrowLeftOutlined, OrderedListOutlined, ReadOutlined } from '@ant-design/icons'
import { Button, DatePicker, Descriptions, Form, Grid, Input, message, Select, Space, Spin, Tag } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import type { Manga, Tag as TagData } from '../types'
import { formatDateTime } from '../utils/date'
import { getRole } from '../utils/token'

const IMG_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 2 3'%3E%3Crect fill='%23f0f0f0' width='2' height='3'/%3E%3C/svg%3E"
const onImgError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.onerror = null
  e.currentTarget.src = IMG_FALLBACK
}

const { useBreakpoint } = Grid

export default function MangaDetailPage() {
  const { uuid } = useParams<{ uuid: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()
  const backTo: string = (location.state as { from?: string } | null)?.from ?? '/mangas'
  const screens = useBreakpoint()
  const isMobile = screens.md === false
  const isAdmin = getRole() === 'admin'
  const [manga, setManga] = useState<Manga | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()
  const [tagOptions, setTagOptions] = useState<TagData[]>([])
  const [tagSearch, setTagSearch] = useState('')
  const [selectedTagUuids, setSelectedTagUuids] = useState<string[]>([])
  const [pendingAddTags, setPendingAddTags] = useState<TagData[]>([])

  const loadManga = (id: string) => {
    setLoading(true)
    api.getManga(id)
      .then(m => {
        setManga(m)
        form.setFieldsValue({ fullname: m.fullname, displayTitle: m.displayTitle, originalTitle: m.originalTitle, publishDate: m.publishDate ? dayjs(m.publishDate) : null })
      })
      .catch(() => message.error(t('manga.loadDetailError')))
      .finally(() => setLoading(false))
  }

  useEffect(() => { if (uuid) loadManga(uuid) }, [uuid])

  useEffect(() => {
    api.getTags({ page: 1, limit: 50, search: tagSearch || undefined })
      .then(res => setTagOptions(res.items))
      .catch(() => message.error(t('tag.loadError')))
  }, [tagSearch])

  const handleSave = async () => {
    if (!uuid) return
    let values: { fullname: string; displayTitle: string; originalTitle: string; publishDate: ReturnType<typeof dayjs> | null }
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    setSaving(true)
    try {
      const { publishDate, ...textValues } = values
      await api.updateManga(uuid, { ...textValues, publishDate: publishDate ? publishDate.format('YYYY-MM-DD') : null })
      if (pendingAddTags.length > 0) {
        await api.createMangaTags(uuid, pendingAddTags.map(t => t.uuid))
      }
      setPendingAddTags([])
      loadManga(uuid)
      message.success(t('manga.saveSuccess'))
    } catch {
      message.error(t('manga.saveError'))
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteTag = async (tagUuid: string) => {
    if (!uuid) return
    try {
      await api.deleteMangaTag(uuid, tagUuid)
      loadManga(uuid)
    } catch {
      message.error(t('manga.deleteTagError'))
    }
  }

  const handleStageTags = () => {
    if (!manga || selectedTagUuids.length === 0) return
    const existingUuids = new Set(manga.mangaTags.map(mt => mt.tag.uuid))
    const pendingUuids = new Set(pendingAddTags.map(t => t.uuid))
    const newTags = tagOptions.filter(t =>
      selectedTagUuids.includes(t.uuid) && !existingUuids.has(t.uuid) && !pendingUuids.has(t.uuid)
    )
    if (newTags.length > 0) setPendingAddTags(prev => [...prev, ...newTags])
    setSelectedTagUuids([])
  }

  if (loading) return <Spin style={{ display: 'block', paddingTop: 48 }} />
  if (!manga) return <div>{t('manga.notFound')}</div>

  const existingTagUuids = new Set(manga.mangaTags.map(mt => mt.tag.uuid))
  const coverIndex = manga.cover ?? 0

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(backTo, { replace: true })}>{t('common.back')}</Button>

      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'flex-start', gap: 24 }}>
        <div style={{ flexShrink: 0, width: isMobile ? '100%' : undefined, maxWidth: 280, margin: isMobile ? '0 auto' : undefined, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <img
            src={`/api/file/mangas/${manga.uuid}/pages/${coverIndex}`}
            alt="cover"
            style={{ width: '100%', borderRadius: 4, display: 'block' }}
            onError={onImgError}
          />
          <Button type="primary" icon={<ReadOutlined />} block onClick={() => navigate(`/mangas/${manga.uuid}/read`)}>
            {t('manga.startReading')}
          </Button>
          {isAdmin && (
            <Button icon={<OrderedListOutlined />} block onClick={() => navigate(`/mangas/${manga.uuid}/pages`)}>
              {t('manga.pageManagement')}
            </Button>
          )}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Descriptions bordered column={isMobile ? 1 : 2} size="small">
            <Descriptions.Item label={t('common.createAt')}>{formatDateTime(manga.createAt)}</Descriptions.Item>
            <Descriptions.Item label={t('common.updateAt')}>{formatDateTime(manga.updateAt)}</Descriptions.Item>
          </Descriptions>
          <Form form={form} layout="vertical">
            <Form.Item label={t('manga.fullname')} name="fullname" rules={[{ required: true, message: t('login.usernameRequired') }]}>
              <Input disabled={!isAdmin} />
            </Form.Item>
            <Form.Item label={t('manga.displayTitle')} name="displayTitle" rules={[{ required: true }]}>
              <Input disabled={!isAdmin} />
            </Form.Item>
            <Form.Item label={t('manga.originalTitle')} name="originalTitle" rules={[{ required: true }]}>
              <Input disabled={!isAdmin} />
            </Form.Item>
            <Form.Item label={t('manga.publishDate')} name="publishDate" style={{ marginBottom: 0 }}>
              <DatePicker style={{ width: '100%' }} disabled={!isAdmin} />
            </Form.Item>
          </Form>
          <div>
            <div style={{ marginBottom: 8, fontSize: 14, color: 'rgba(0,0,0,0.88)' }}>{t('manga.tags')}</div>
            <Space wrap size={[6, 8]} style={{ marginBottom: 8 }}>
              {manga.mangaTags.length === 0 && pendingAddTags.length === 0
                ? <span style={{ color: '#999' }}>{t('manga.noTags')}</span>
                : <>
                    {manga.mangaTags.map(mt => (
                      <Tag
                        key={mt.tag.uuid}
                        color="blue"
                        closable={isAdmin}
                        onClose={isAdmin ? () => handleDeleteTag(mt.tag.uuid) : undefined}
                        onClick={() => navigate(`/tags/${mt.tag.uuid}/mangas`, { state: { from: location.pathname } })}
                        style={{ cursor: 'pointer' }}
                      >
                        {mt.tag.tagType.name}: {mt.tag.name}
                      </Tag>
                    ))}
                    {isAdmin && pendingAddTags.map(tag => (
                      <Tag
                        key={tag.uuid}
                        color="orange"
                        closable
                        onClose={() => setPendingAddTags(prev => prev.filter(pt => pt.uuid !== tag.uuid))}
                      >
                        {t('manga.tagPending', { name: `${tag.tagType.name}: ${tag.name}` })}
                      </Tag>
                    ))}
                  </>
              }
            </Space>
            {isAdmin && (
              <div style={{ display: 'flex', gap: 8 }}>
                <Select
                  mode="multiple"
                  style={{ flex: 1 }}
                  placeholder={t('manga.searchTags')}
                  value={selectedTagUuids}
                  onChange={setSelectedTagUuids}
                  onSearch={setTagSearch}
                  filterOption={false}
                  showSearch
                  options={tagOptions
                    .filter(tag => !existingTagUuids.has(tag.uuid) && !pendingAddTags.some(pt => pt.uuid === tag.uuid))
                    .map(tag => ({ value: tag.uuid, label: `${tag.tagType.name}: ${tag.name}` }))}
                />
                <Button onClick={handleStageTags} disabled={selectedTagUuids.length === 0}>{t('common.add')}</Button>
              </div>
            )}
          </div>
          {isAdmin && (
            <Button type="primary" loading={saving} onClick={handleSave} style={{ alignSelf: 'flex-start' }}>
              {t('common.save')}
            </Button>
          )}
        </div>
      </div>
    </Space>
  )
}
