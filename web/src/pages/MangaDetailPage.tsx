import { ArrowLeftOutlined, OrderedListOutlined, ReadOutlined } from '@ant-design/icons'
import { Button, DatePicker, Descriptions, Form, Grid, Input, message, Select, Space, Spin, Tag } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import type { Manga, Tag as TagData } from '../types'
import { formatDateTime } from '../utils/date'

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
  const backTo: string = (location.state as { from?: string } | null)?.from ?? '/mangas'
  const screens = useBreakpoint()
  const isMobile = screens.md === false
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
      .catch(() => message.error('加载漫画失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { if (uuid) loadManga(uuid) }, [uuid])

  useEffect(() => {
    api.getTags({ page: 1, limit: 50, search: tagSearch || undefined })
      .then(res => setTagOptions(res.items))
      .catch(() => message.error('加载标签失败'))
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
      const updateData = {
        ...textValues,
        publishDate: publishDate ? publishDate.format('YYYY-MM-DD') : null,
      }
      await api.updateManga(uuid, updateData)
      if (pendingAddTags.length > 0) {
        await api.createMangaTags(uuid, pendingAddTags.map(t => t.uuid))
      }
      setPendingAddTags([])
      loadManga(uuid)
      message.success('保存成功')
    } catch {
      message.error('保存失败')
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
      message.error('删除标签失败')
    }
  }

  const handleStageTags = () => {
    if (!manga || selectedTagUuids.length === 0) return
    const existingUuids = new Set(manga.mangaTags.map(mt => mt.tag.uuid))
    const pendingUuids = new Set(pendingAddTags.map(t => t.uuid))
    const newTags = tagOptions.filter(t =>
      selectedTagUuids.includes(t.uuid) &&
      !existingUuids.has(t.uuid) &&
      !pendingUuids.has(t.uuid)
    )
    if (newTags.length > 0) setPendingAddTags(prev => [...prev, ...newTags])
    setSelectedTagUuids([])
  }

  if (loading) return <Spin style={{ display: 'block', paddingTop: 48 }} />
  if (!manga) return <div>未找到漫画</div>

  const existingTagUuids = new Set(manga.mangaTags.map(mt => mt.tag.uuid))
  const coverIndex = manga.cover ?? 0

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(backTo, { replace: true })}>返回</Button>

      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'flex-start', gap: 24 }}>
        <div style={{ flexShrink: 0, width: isMobile ? '100%' : undefined, maxWidth: 280, margin: isMobile ? '0 auto' : undefined, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <img
            src={`/api/file/mangas/${manga.uuid}/pages/${coverIndex}`}
            alt="cover"
            style={{ width: '100%', borderRadius: 4, display: 'block' }}
            onError={onImgError}
          />
          <Button
            type="primary"
            icon={<ReadOutlined />}
            block
            onClick={() => navigate(`/mangas/${manga.uuid}/read`)}
          >
            开始阅读
          </Button>
          <Button
            icon={<OrderedListOutlined />}
            block
            onClick={() => navigate(`/mangas/${manga.uuid}/pages`)}
          >
            页面管理
          </Button>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Descriptions bordered column={isMobile ? 1 : 2} size="small">
            <Descriptions.Item label="创建时间">{formatDateTime(manga.createAt)}</Descriptions.Item>
            <Descriptions.Item label="更新时间">{formatDateTime(manga.updateAt)}</Descriptions.Item>
          </Descriptions>
          <Form form={form} layout="vertical">
            <Form.Item label="完整文件名" name="fullname" rules={[{ required: true, message: '请输入完整文件名' }]}>
              <Input />
            </Form.Item>
            <Form.Item label="显示标题" name="displayTitle" rules={[{ required: true, message: '请输入显示标题' }]}>
              <Input />
            </Form.Item>
            <Form.Item label="原始标题" name="originalTitle" rules={[{ required: true, message: '请输入原始标题' }]}>
              <Input />
            </Form.Item>
            <Form.Item label="出版日期" name="publishDate" style={{ marginBottom: 0 }}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Form>
          <div>
            <div style={{ marginBottom: 8, fontSize: 14, color: 'rgba(0,0,0,0.88)' }}>标签</div>
            <Space wrap size={[6, 8]} style={{ marginBottom: 8 }}>
              {manga.mangaTags.length === 0 && pendingAddTags.length === 0
                ? <span style={{ color: '#999' }}>暂无标签</span>
                : <>
                    {manga.mangaTags.map(mt => (
                      <Tag
                        key={mt.tag.uuid}
                        color="blue"
                        closable
                        onClose={() => handleDeleteTag(mt.tag.uuid)}
                        onClick={() => navigate(`/tags/${mt.tag.uuid}/mangas`, { state: { from: location.pathname } })}
                        style={{ cursor: 'pointer' }}
                      >
                        {mt.tag.tagType.name}: {mt.tag.name}
                      </Tag>
                    ))}
                    {pendingAddTags.map(t => (
                      <Tag
                        key={t.uuid}
                        color="orange"
                        closable
                        onClose={() => setPendingAddTags(prev => prev.filter(pt => pt.uuid !== t.uuid))}
                      >
                        {t.tagType.name}: {t.name}（待保存）
                      </Tag>
                    ))}
                  </>
              }
            </Space>
            <div style={{ display: 'flex', gap: 8 }}>
              <Select
                mode="multiple"
                style={{ flex: 1 }}
                placeholder="搜索并选择标签"
                value={selectedTagUuids}
                onChange={setSelectedTagUuids}
                onSearch={setTagSearch}
                filterOption={false}
                showSearch
                options={tagOptions
                  .filter(t => !existingTagUuids.has(t.uuid) && !pendingAddTags.some(pt => pt.uuid === t.uuid))
                  .map(t => ({ value: t.uuid, label: `${t.tagType.name}: ${t.name}` }))}
              />
              <Button onClick={handleStageTags} disabled={selectedTagUuids.length === 0}>
                添加
              </Button>
            </div>
          </div>
          <Button type="primary" loading={saving} onClick={handleSave} style={{ alignSelf: 'flex-start' }}>
            保存
          </Button>
        </div>
      </div>
    </Space>
  )
}