import { ArrowLeftOutlined, CheckCircleFilled } from '@ant-design/icons'
import { Button, Descriptions, Form, Input, message, Pagination, Select, Space, Spin, Tag, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import type { Manga, Tag as TagData } from '../types'
import { formatDate, formatDateTime } from '../utils/date'

const { Title } = Typography

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
  const [pendingCover, setPendingCover] = useState<number | null>(null)
  const [pendingAddTags, setPendingAddTags] = useState<TagData[]>([])
  const [imgPage, setImgPage] = useState(1)
  const [imgPageSize, setImgPageSize] = useState(10)

  const loadManga = (id: string) => {
    setLoading(true)
    api.getManga(id)
      .then(m => {
        setManga(m)
        form.setFieldsValue({ fullname: m.fullname, displayTitle: m.displayTitle, originalTitle: m.originalTitle })
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { if (uuid) loadManga(uuid) }, [uuid])

  useEffect(() => {
    api.getTags({ page: 1, limit: 50, search: tagSearch || undefined })
      .then(res => setTagOptions(res.items))
  }, [tagSearch])

  const handleSave = async () => {
    if (!uuid) return
    let values: { fullname: string; displayTitle: string; originalTitle: string }
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    setSaving(true)
    try {
      const savedCoverIndex = manga?.cover ?? 0
      const updateData = {
        ...values,
        ...(pendingCover !== null && pendingCover !== savedCoverIndex ? { cover: pendingCover } : {}),
      }
      await api.updateManga(uuid, updateData)
      if (pendingAddTags.length > 0) {
        await api.createMangaTags(uuid, pendingAddTags.map(t => t.uuid))
      }
      setPendingCover(null)
      setPendingAddTags([])
      loadManga(uuid)
      message.success('保存成功')
    } catch {
      message.error('保存失败')
    } finally {
      setSaving(false)
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
  const savedCoverIndex = manga.cover ?? 0
  const coverIndex = pendingCover ?? savedCoverIndex

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>返回</Button>

      <Space align="start" size="large">
        <img
          src={`/api/file/mangas/${manga.uuid}/pages/${coverIndex}`}
          alt="cover"
          style={{ width: 180, borderRadius: 4, flexShrink: 0 }}
        />
        <Descriptions bordered column={2} size="small">
<Descriptions.Item label="封面页码">
            {savedCoverIndex}
            {pendingCover !== null && pendingCover !== savedCoverIndex && (
              <span style={{ color: '#faad14', marginLeft: 4 }}>→ {pendingCover}（待保存）</span>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="出版日期">
            {manga.publishDate ? formatDate(manga.publishDate) : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="标签数量">{manga.mangaTags.length + pendingAddTags.length}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{formatDateTime(manga.createAt)}</Descriptions.Item>
          <Descriptions.Item label="更新时间" span={2}>{formatDateTime(manga.updateAt)}</Descriptions.Item>
        </Descriptions>
      </Space>

      <div>
        <Title level={5}>选择封面</Title>
        <Pagination
          current={imgPage}
          pageSize={imgPageSize}
          total={manga.pages.length}
          onChange={p => setImgPage(p)}
          onShowSizeChange={(_, size) => { setImgPage(1); setImgPageSize(size) }}
          showSizeChanger
          showTotal={t => `共 ${t} 张`}
          style={{ marginBottom: 12 }}
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
          {manga.pages.slice((imgPage - 1) * imgPageSize, imgPage * imgPageSize).map((_, i) => {
            const index = (imgPage - 1) * imgPageSize + i
            const isCover = index === coverIndex
            return (
              <div
                key={index}
                onClick={() => { if (index !== coverIndex) setPendingCover(index) }}
                style={{
                  position: 'relative',
                  cursor: isCover ? 'default' : 'pointer',
                  borderRadius: 4,
                  border: isCover ? '2px solid #1677ff' : '2px solid transparent',
                  overflow: 'hidden',
                }}
              >
                <img
                  src={`/api/file/mangas/${manga.uuid}/pages/${index}`}
                  alt={`page ${index}`}
                  loading="lazy"
                  style={{ width: '100%', display: 'block' }}
                />
                <div style={{ textAlign: 'center', fontSize: 11, color: isCover ? '#1677ff' : '#999', padding: '2px 0' }}>
                  {index}
                </div>
                {isCover && (
                  <CheckCircleFilled style={{ position: 'absolute', top: 4, right: 4, color: '#1677ff', fontSize: 16, background: '#fff', borderRadius: '50%' }} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <Title level={5}>编辑信息</Title>
        <Form form={form} layout="vertical" style={{ maxWidth: 600 }}>
          <Form.Item label="完整文件名" name="fullname" rules={[{ required: true, message: '请输入完整文件名' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="显示标题" name="displayTitle" rules={[{ required: true, message: '请输入显示标题' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="原始标题" name="originalTitle" rules={[{ required: true, message: '请输入原始标题' }]}>
            <Input />
          </Form.Item>
        </Form>
      </div>

      <div>
        <Title level={5}>当前标签</Title>
        <Space wrap size={[6, 8]}>
          {manga.mangaTags.length === 0 && pendingAddTags.length === 0
            ? <span style={{ color: '#999' }}>暂无标签</span>
            : <>
                {manga.mangaTags.map(mt => (
                  <Tag key={mt.tag.uuid} color="blue">
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
        <Title level={5}>添加标签</Title>
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
    </Space>
  )
}