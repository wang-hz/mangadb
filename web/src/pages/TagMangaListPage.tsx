import { AppstoreOutlined, ArrowLeftOutlined, BarsOutlined, CalendarOutlined, DeleteOutlined, SearchOutlined, TagsOutlined } from '@ant-design/icons'
import { Button, DatePicker, Descriptions, Form, Input, message, Modal, Pagination, Popconfirm, Segmented, Select, Space, Table } from 'antd'
import dayjs from 'dayjs'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import MangaGrid from '../components/MangaGrid'
import { usePagedData } from '../hooks/usePagedData'
import type { Manga, Tag as TagData, TagType } from '../types'
import { formatDate, formatDateTime } from '../utils/date'

type SortBy = 'updateAt' | 'createAt' | 'publishDate'
type SortOrder = 'asc' | 'desc'
type ViewMode = 'list' | 'grid'

const VIEW_MODE_KEY = 'mangaViewMode'

const SORT_OPTIONS: { label: string; value: `${SortBy}-${SortOrder}` }[] = [
  { label: '更新时间（最新）', value: 'updateAt-desc' },
  { label: '更新时间（最早）', value: 'updateAt-asc' },
  { label: '创建时间（最新）', value: 'createAt-desc' },
  { label: '创建时间（最早）', value: 'createAt-asc' },
  { label: '出版日期（最新）', value: 'publishDate-desc' },
  { label: '出版日期（最早）', value: 'publishDate-asc' },
]

const VALID_SORTS: Set<string> = new Set(SORT_OPTIONS.map(o => o.value))

export default function TagMangaListPage() {
  const { uuid } = useParams<{ uuid: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1') || 1)
  const pageSize = parseInt(searchParams.get('limit') ?? '10') || 10
  const search = searchParams.get('search') ?? ''
  const sort = (VALID_SORTS.has(searchParams.get('sort') ?? '') ? searchParams.get('sort')! : 'updateAt-desc') as `${SortBy}-${SortOrder}`

  const [tag, setTag] = useState<TagData | null>(null)
  const [searchInput, setSearchInput] = useState(search)
  const [tagTypes, setTagTypes] = useState<TagType[]>([])

  // ── Inline edit ────────────────────────────────────────────────────────────
  const [form] = Form.useForm()
  const [isDirty, setIsDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // ── Batch operations ───────────────────────────────────────────────────────
  const [batchTagModalOpen, setBatchTagModalOpen] = useState(false)
  const [batchTagOptions, setBatchTagOptions] = useState<TagData[]>([])
  const [batchTagSearch, setBatchTagSearch] = useState('')
  const [batchSelectedTagUuid, setBatchSelectedTagUuid] = useState<string | undefined>()
  const [batchTagLoading, setBatchTagLoading] = useState(false)
  const [batchDateModalOpen, setBatchDateModalOpen] = useState(false)
  const [batchDate, setBatchDate] = useState<ReturnType<typeof dayjs> | null>(null)
  const [batchDateLoading, setBatchDateLoading] = useState(false)

  const [sortBy, sortOrder] = sort.split('-') as [SortBy, SortOrder]
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem(VIEW_MODE_KEY) as ViewMode | null) ?? 'list',
  )

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode)
    localStorage.setItem(VIEW_MODE_KEY, mode)
  }

  useEffect(() => { setSearchInput(search) }, [search])

  useEffect(() => {
    api.getTagTypes({ page: 1, limit: 100 })
      .then(res => setTagTypes(res.items))
      .catch(() => message.error('加载标签类型失败'))
  }, [])

  useEffect(() => {
    if (!uuid) return
    api.getTag(uuid)
      .then(t => {
        setTag(t)
        form.setFieldsValue({ name: t.name, type: t.tagType.name })
      })
      .catch(() => message.error('加载标签信息失败'))
  }, [uuid, form])

  useEffect(() => {
    if (!batchTagModalOpen) return
    api.getTags({ page: 1, limit: 50, search: batchTagSearch || undefined })
      .then(res => setBatchTagOptions(res.items))
      .catch(() => message.error('加载标签失败'))
  }, [batchTagSearch, batchTagModalOpen])

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!uuid) return
    let values: { name: string; type: string }
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    setSaving(true)
    try {
      const updated = await api.updateTag(uuid, values)
      setTag(updated)
      form.setFieldsValue({ name: updated.name, type: updated.tagType.name })
      setIsDirty(false)
      message.success('标签更新成功')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      message.error(msg.startsWith('409') ? '标签名已存在' : '更新失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!uuid) return
    setDeleting(true)
    try {
      await api.deleteTag(uuid)
      message.success('标签已删除')
      navigate('/tags', { replace: true })
    } catch {
      message.error('删除失败')
      setDeleting(false)
    }
  }

  const handleBatchAddTag = async () => {
    if (!uuid || !batchSelectedTagUuid) return
    setBatchTagLoading(true)
    try {
      const { added } = await api.batchAddTagToMangasByTag(uuid, batchSelectedTagUuid)
      message.success(`已为 ${added} 部漫画添加标签`)
      setBatchTagModalOpen(false)
      setBatchSelectedTagUuid(undefined)
      setBatchTagSearch('')
    } catch {
      message.error('批量添加失败')
    } finally {
      setBatchTagLoading(false)
    }
  }

  const handleBatchSetDate = async () => {
    if (!uuid || !batchDate) return
    setBatchDateLoading(true)
    try {
      const { updated } = await api.batchSetPublishDateByTag(uuid, batchDate.format('YYYY-MM-DD'))
      message.success(`已为 ${updated} 部漫画设置出版日期`)
      setBatchDateModalOpen(false)
      setBatchDate(null)
    } catch {
      message.error('批量设置失败')
    } finally {
      setBatchDateLoading(false)
    }
  }

  const { items: data, total, loading } = usePagedData(
    () => api.getMangasByTag(uuid!, { page, limit: pageSize, search: search || undefined, sortBy, sortOrder }),
    [uuid, page, pageSize, search, sort],
    '加载漫画列表失败',
  )

  const handlePageChange = (p: number) =>
    setSearchParams(prev => { prev.set('page', String(p)); return prev }, { replace: true })

  const handlePageSizeChange = (_: number, size: number) =>
    setSearchParams(prev => { prev.set('page', '1'); prev.set('limit', String(size)); return prev }, { replace: true })

  const columns: TableColumnsType<Manga> = [
    { title: '显示标题', dataIndex: 'displayTitle', ellipsis: true },
    { title: '原始标题', dataIndex: 'originalTitle', ellipsis: true },
    {
      title: '出版日期',
      dataIndex: 'publishDate',
      width: 110,
      render: (v: string | null) => v ? formatDate(v) : '-',
    },
    {
      title: '创建时间',
      dataIndex: 'createAt',
      width: 180,
      render: (v: string) => formatDateTime(v),
    },
    {
      title: '更新时间',
      dataIndex: 'updateAt',
      width: 180,
      render: (v: string) => formatDateTime(v),
    },
  ]

  const tablePagination: TablePaginationConfig = {
    current: page,
    pageSize,
    total,
    onChange: handlePageChange,
    onShowSizeChange: handlePageSizeChange,
    showSizeChanger: true,
    showTotal: t => `共 ${t} 条`,
    position: ['topRight', 'bottomRight'],
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">

      {/* Header row: back + delete on left, save on right */}
      <Space style={{ justifyContent: 'space-between', width: '100%' }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} />
          <Popconfirm
            title={`删除标签「${tag?.name ?? ''}」？`}
            description="此操作将同时移除该标签与所有漫画的关联，且不可撤销。"
            onConfirm={handleDelete}
            okText="确认删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            disabled={!tag}
          >
            <Button danger icon={<DeleteOutlined />} loading={deleting} disabled={!tag}>
              删除标签
            </Button>
          </Popconfirm>
        </Space>
        <Button
          type="primary"
          loading={saving}
          disabled={!isDirty}
          onClick={handleSave}
        >
          保存
        </Button>
      </Space>

      {/* Inline-editable tag info */}
      <Form form={form} onValuesChange={() => setIsDirty(true)}>
        <Descriptions bordered size="small" column={2}>
          <Descriptions.Item label="标签名称">
            <Form.Item name="name" noStyle rules={[{ required: true, message: '请输入标签名称' }]}>
              <Input style={{ width: '100%' }} />
            </Form.Item>
          </Descriptions.Item>
          <Descriptions.Item label="标签类型">
            <Form.Item name="type" noStyle rules={[{ required: true, message: '请选择标签类型' }]}>
              <Select style={{ width: '100%' }} options={tagTypes.map(t => ({ value: t.name, label: t.name }))} />
            </Form.Item>
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">{tag ? formatDateTime(tag.createAt) : '-'}</Descriptions.Item>
          <Descriptions.Item label="更新时间">{tag ? formatDateTime(tag.updateAt) : '-'}</Descriptions.Item>
        </Descriptions>
      </Form>

      {/* Manga list toolbar */}
      <Space style={{ justifyContent: 'space-between', width: '100%' }}>
        <Space>
          <Input
            prefix={<SearchOutlined />}
            placeholder="搜索显示标题或原始标题，按回车搜索"
            value={searchInput}
            onChange={e => {
              setSearchInput(e.target.value)
              if (!e.target.value) setSearchParams(prev => { prev.delete('search'); prev.set('page', '1'); return prev }, { replace: true })
            }}
            onPressEnter={() => setSearchParams(prev => {
              if (searchInput) prev.set('search', searchInput); else prev.delete('search')
              prev.set('page', '1')
              return prev
            }, { replace: true })}
            allowClear
            style={{ width: 360 }}
          />
          <Select
            value={sort}
            onChange={v => setSearchParams(prev => { prev.set('sort', v); prev.set('page', '1'); return prev }, { replace: true })}
            options={SORT_OPTIONS}
            style={{ width: 180 }}
          />
        </Space>
        <Space>
          <Button icon={<TagsOutlined />} onClick={() => setBatchTagModalOpen(true)}>
            批量添加标签
          </Button>
          <Button icon={<CalendarOutlined />} onClick={() => setBatchDateModalOpen(true)}>
            批量设置出版日期
          </Button>
          <Segmented
            value={viewMode}
            onChange={v => handleViewModeChange(v as ViewMode)}
            options={[
              { value: 'list', icon: <BarsOutlined /> },
              { value: 'grid', icon: <AppstoreOutlined /> },
            ]}
          />
        </Space>
      </Space>

      {/* Batch modals */}
      <Modal
        title="批量添加标签"
        open={batchTagModalOpen}
        onCancel={() => { setBatchTagModalOpen(false); setBatchSelectedTagUuid(undefined); setBatchTagSearch('') }}
        onOk={handleBatchAddTag}
        okText="确认添加"
        cancelText="取消"
        confirmLoading={batchTagLoading}
        okButtonProps={{ disabled: !batchSelectedTagUuid }}
      >
        <p style={{ marginBottom: 12, color: '#666' }}>
          将选中的标签添加至「{tag?.tagType.name}: {tag?.name}」下的所有 {total} 部漫画（已有该标签的漫画会自动跳过）。
        </p>
        <Select
          style={{ width: '100%' }}
          placeholder="搜索并选择标签"
          value={batchSelectedTagUuid}
          onChange={setBatchSelectedTagUuid}
          onSearch={setBatchTagSearch}
          filterOption={false}
          showSearch
          options={batchTagOptions.map(t => ({ value: t.uuid, label: `${t.tagType.name}: ${t.name}` }))}
        />
      </Modal>
      <Modal
        title="批量设置出版日期"
        open={batchDateModalOpen}
        onCancel={() => { setBatchDateModalOpen(false); setBatchDate(null) }}
        onOk={handleBatchSetDate}
        okText="确认设置"
        cancelText="取消"
        confirmLoading={batchDateLoading}
        okButtonProps={{ disabled: !batchDate }}
      >
        <p style={{ marginBottom: 12, color: '#666' }}>
          将选中日期设置为「{tag?.tagType.name}: {tag?.name}」下所有 {total} 部漫画的出版日期。
        </p>
        <DatePicker
          style={{ width: '100%' }}
          value={batchDate}
          onChange={setBatchDate}
        />
      </Modal>

      {/* Manga list */}
      {viewMode === 'list' ? (
        <Table
          rowKey="uuid"
          dataSource={data}
          columns={columns}
          pagination={tablePagination}
          loading={loading}
          size="middle"
          onRow={record => ({
            onClick: () => navigate(`/mangas/${record.uuid}`),
            style: { cursor: 'pointer' },
          })}
        />
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Pagination
              current={page}
              pageSize={pageSize}
              total={total}
              onChange={handlePageChange}
              onShowSizeChange={handlePageSizeChange}
              showSizeChanger
              showTotal={t => `共 ${t} 条`}
            />
          </div>
          <MangaGrid data={data} loading={loading} />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Pagination
              current={page}
              pageSize={pageSize}
              total={total}
              onChange={handlePageChange}
              onShowSizeChange={handlePageSizeChange}
              showSizeChanger
              showTotal={t => `共 ${t} 条`}
            />
          </div>
        </Space>
      )}
    </Space>
  )
}