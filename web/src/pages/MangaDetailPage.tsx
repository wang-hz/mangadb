import { ArrowLeftOutlined } from '@ant-design/icons'
import { Button, Descriptions, Form, Input, InputNumber, message, Select, Space, Spin, Tag, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import type { Manga, Tag as TagData } from '../types'

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
  const [addingTags, setAddingTags] = useState(false)

  const loadManga = (id: string) => {
    setLoading(true)
    api.getManga(id)
      .then(m => {
        setManga(m)
        form.setFieldsValue({ fullname: m.fullname, displayTitle: m.displayTitle, originalTitle: m.originalTitle, cover: m.cover })
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { if (uuid) loadManga(uuid) }, [uuid])

  useEffect(() => {
    api.getTags({ page: 1, limit: 50, search: tagSearch || undefined })
      .then(res => setTagOptions(res.items))
  }, [tagSearch])

  const handleSave = async (values: { fullname: string; displayTitle: string; originalTitle: string; cover: number | null }) => {
    if (!uuid) return
    setSaving(true)
    try {
      const updated = await api.updateManga(uuid, values)
      setManga(prev => prev ? { ...prev, ...updated } : prev)
      message.success('保存成功')
    } catch {
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleAddTags = async () => {
    if (!uuid || selectedTagUuids.length === 0) return
    setAddingTags(true)
    try {
      await api.createMangaTags(uuid, selectedTagUuids)
      loadManga(uuid)
      setSelectedTagUuids([])
      message.success('标签添加成功')
    } catch {
      message.error('添加标签失败')
    } finally {
      setAddingTags(false)
    }
  }

  if (loading) return <Spin style={{ display: 'block', paddingTop: 48 }} />
  if (!manga) return <div>未找到漫画</div>

  const existingTagUuids = new Set(manga.mangaTags.map(mt => mt.tag.uuid))

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Space align="center">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/mangas')}>返回</Button>
        <Title level={4} style={{ margin: 0 }}>{manga.displayTitle}</Title>
      </Space>

      <Space align="start" size="large">
        <img
          src={`/api/file/mangas/${manga.uuid}/pages/${manga.cover ?? 0}`}
          alt="cover"
          style={{ width: 180, borderRadius: 4, flexShrink: 0 }}
        />
        <Descriptions bordered column={2} size="small">
          <Descriptions.Item label="UUID" span={2}>{manga.uuid}</Descriptions.Item>
          <Descriptions.Item label="封面页码">{manga.cover ?? 0}</Descriptions.Item>
          <Descriptions.Item label="出版日期">
            {manga.publishDate ? new Date(manga.publishDate).toLocaleDateString() : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="标签数量">{manga.mangaTags.length}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{new Date(manga.createAt).toLocaleString()}</Descriptions.Item>
          <Descriptions.Item label="更新时间" span={2}>{new Date(manga.updateAt).toLocaleString()}</Descriptions.Item>
        </Descriptions>
      </Space>

      <div>
        <Title level={5}>编辑信息</Title>
        <Form form={form} layout="vertical" onFinish={handleSave} style={{ maxWidth: 600 }}>
          <Form.Item label="完整文件名" name="fullname" rules={[{ required: true, message: '请输入完整文件名' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="显示标题" name="displayTitle" rules={[{ required: true, message: '请输入显示标题' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="原始标题" name="originalTitle" rules={[{ required: true, message: '请输入原始标题' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="封面页码" name="cover" extra="留空则使用第 0 张图片作为封面">
            <InputNumber min={0} style={{ width: 120 }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={saving}>保存</Button>
          </Form.Item>
        </Form>
      </div>

      <div>
        <Title level={5}>当前标签</Title>
        <Space wrap size={[6, 8]}>
          {manga.mangaTags.length === 0
            ? <span style={{ color: '#999' }}>暂无标签</span>
            : manga.mangaTags.map(mt => (
              <Tag key={mt.tag.uuid} color="blue">
                {mt.tag.tagType.name}: {mt.tag.name}
              </Tag>
            ))}
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
              .filter(t => !existingTagUuids.has(t.uuid))
              .map(t => ({ value: t.uuid, label: `${t.tagType.name}: ${t.name}` }))}
          />
          <Button
            type="primary"
            onClick={handleAddTags}
            loading={addingTags}
            disabled={selectedTagUuids.length === 0}
          >
            添加
          </Button>
        </Space>
      </div>
    </Space>
  )
}