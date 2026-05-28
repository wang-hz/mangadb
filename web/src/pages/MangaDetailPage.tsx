import { ArrowLeftOutlined, DeleteOutlined, DownOutlined, ReadOutlined, StarFilled, UpOutlined } from '@ant-design/icons'
import { Button, DatePicker, Descriptions, Form, Input, message, Select, Space, Spin, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import type { Manga, Tag as TagData } from '../types'
import { formatDateTime } from '../utils/date'

const { Title } = Typography

// 2:3 gray placeholder shown when a page image fails to load
const IMG_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 2 3'%3E%3Crect fill='%23f0f0f0' width='2' height='3'/%3E%3C/svg%3E"
const onImgError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.onerror = null
  e.currentTarget.src = IMG_FALLBACK
}

export default function MangaDetailPage() {
  const { uuid } = useParams<{ uuid: string }>()
  const navigate = useNavigate()
  const [manga, setManga] = useState<Manga | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()
  const [tagOptions, setTagOptions] = useState<TagData[]>([])
  const [tagSearch, setTagSearch] = useState('')
  const [selectedTagUuids, setSelectedTagUuids] = useState<string[]>([])
  const [pendingAddTags, setPendingAddTags] = useState<TagData[]>([])
  const [allFolderFiles, setAllFolderFiles] = useState<string[]>([])
  const [folderFilesLoading, setFolderFilesLoading] = useState(false)
  const [editedPages, setEditedPages] = useState<string[]>([])
  const [editedCover, setEditedCover] = useState(0)
  const [pagesSaving, setPagesSaving] = useState(false)

  const loadManga = (id: string) => {
    setLoading(true)
    api.getManga(id)
      .then(m => {
        setManga(m)
        form.setFieldsValue({ fullname: m.fullname, displayTitle: m.displayTitle, originalTitle: m.originalTitle, publishDate: m.publishDate ? dayjs(m.publishDate) : null })
        setEditedPages(m.pages ?? [])
        setEditedCover(m.cover ?? 0)
      })
      .catch(() => message.error('加载漫画失败'))
      .finally(() => setLoading(false))
  }

  const loadFolderFiles = (id: string) => {
    setFolderFilesLoading(true)
    api.getMangaFolderFiles(id)
      .then(files => setAllFolderFiles(files))
      .catch(() => message.error('加载文件夹内容失败'))
      .finally(() => setFolderFilesLoading(false))
  }

  useEffect(() => {
    if (uuid) {
      loadManga(uuid)
      loadFolderFiles(uuid)
    }
  }, [uuid])

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

  const movePageUp = (index: number) => {
    setEditedPages(prev => {
      const next = [...prev]
      ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
      return next
    })
    setEditedCover(prev => prev === index ? index - 1 : prev === index - 1 ? index : prev)
  }

  const movePageDown = (index: number) => {
    setEditedPages(prev => {
      const next = [...prev]
      ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
      return next
    })
    setEditedCover(prev => prev === index ? index + 1 : prev === index + 1 ? index : prev)
  }

  const removePage = (index: number) => {
    setEditedPages(prev => prev.filter((_, i) => i !== index))
    setEditedCover(prev => prev === index ? 0 : prev > index ? prev - 1 : prev)
  }

  const addPage = (filename: string) => {
    setEditedPages(prev => [...prev, filename])
  }

  const handleSavePages = async () => {
    if (!uuid) return
    setPagesSaving(true)
    try {
      await api.updateMangaPages(uuid, editedPages, editedCover)
      loadManga(uuid)
      message.success('页面保存成功')
    } catch {
      message.error('页面保存失败')
    } finally {
      setPagesSaving(false)
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
  const pagesInEditor = new Set(editedPages)
  const notInPages = allFolderFiles.filter(f => !pagesInEditor.has(f))

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>返回</Button>

      <Space align="start" size="large" style={{ width: '100%' }}>
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <img
            src={`/api/file/mangas/${manga.uuid}/pages/${coverIndex}`}
            alt="cover"
            style={{ width: 280, borderRadius: 4, display: 'block' }}
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
        </div>
        <Space direction="vertical" style={{ flex: 1 }} size="middle">
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="创建时间">{formatDateTime(manga.createAt)}</Descriptions.Item>
            <Descriptions.Item label="更新时间">{formatDateTime(manga.updateAt)}</Descriptions.Item>
          </Descriptions>
          <div>
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
              <Form.Item label="出版日期" name="publishDate">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Form>
          </div>
        </Space>
      </Space>

      <div>
        <Title level={5}>标签</Title>
        <Space wrap size={[6, 8]}>
          {manga.mangaTags.length === 0 && pendingAddTags.length === 0
            ? <span style={{ color: '#999' }}>暂无标签</span>
            : <>
                {manga.mangaTags.map(mt => (
                  <Tag
                    key={mt.tag.uuid}
                    color="blue"
                    closable
                    onClose={() => handleDeleteTag(mt.tag.uuid)}
                    onClick={() => navigate(`/tags/${mt.tag.uuid}/mangas`)}
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
      </div>

      <div>
        <Space>
          <Select
            mode="multiple"
            style={{ minWidth: 360 }}
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
          <Button
            onClick={handleStageTags}
            disabled={selectedTagUuids.length === 0}
          >
            添加
          </Button>
        </Space>
      </div>

      <Button type="primary" size="large" loading={saving} onClick={handleSave}>
        保存
      </Button>

      <div>
        <Title level={5}>页面管理</Title>
        {folderFilesLoading ? (
          <Spin />
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <div style={{ marginBottom: 8, color: '#666' }}>当前页面（{editedPages.length} 页）</div>
              <div style={{ maxHeight: 500, overflowY: 'auto', border: '1px solid #d9d9d9', borderRadius: 6, padding: 4 }}>
                {editedPages.length === 0 && (
                  <div style={{ padding: 16, color: '#999', textAlign: 'center' }}>暂无页面</div>
                )}
                {editedPages.map((filename, index) => (
                  <div
                    key={filename}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '4px 8px',
                      borderRadius: 4,
                      marginBottom: 2,
                      border: index === editedCover ? '1px solid #1677ff' : '1px solid transparent',
                      background: index === editedCover ? '#e6f4ff' : undefined,
                    }}
                  >
                    <img
                      src={`/api/file/mangas/${uuid}/file/${encodeURIComponent(filename)}`}
                      alt={filename}
                      style={{ width: 36, height: 50, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }}
                      onError={onImgError}
                    />
                    <span style={{ flex: 1, fontSize: 12, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {filename}
                    </span>
                    {index === editedCover && (
                      <Tag color="blue" icon={<StarFilled />} style={{ flexShrink: 0 }}>封面</Tag>
                    )}
                    <Button size="small" icon={<UpOutlined />} disabled={index === 0} onClick={() => movePageUp(index)} />
                    <Button size="small" icon={<DownOutlined />} disabled={index === editedPages.length - 1} onClick={() => movePageDown(index)} />
                    <Button size="small" disabled={index === editedCover} onClick={() => setEditedCover(index)}>封面</Button>
                    <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removePage(index)} />
                  </div>
                ))}
              </div>
            </div>

            {notInPages.length > 0 && (
              <div>
                <div style={{ marginBottom: 8, color: '#666' }}>文件夹中未包含的文件（{notInPages.length} 个）</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  {notInPages.map(filename => (
                    <div key={filename} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: 80 }}>
                      <img
                        src={`/api/file/mangas/${uuid}/file/${encodeURIComponent(filename)}`}
                        alt={filename}
                        style={{ width: 80, height: 112, objectFit: 'cover', border: '1px solid #d9d9d9', borderRadius: 4 }}
                        onError={onImgError}
                      />
                      <div style={{ fontSize: 11, color: '#666', textAlign: 'center', wordBreak: 'break-all', width: '100%' }}>
                        {filename}
                      </div>
                      <Button size="small" onClick={() => addPage(filename)}>添加</Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button type="primary" loading={pagesSaving} onClick={handleSavePages}>
              保存页面
            </Button>
          </Space>
        )}
      </div>
    </Space>
  )
}