import { PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { Button, Form, Grid, Input, message, Modal, Select as AntSelect, Space, Table, Tag } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { usePagedData } from '../hooks/usePagedData'
import type { Tag as TagData, TagType } from '../types'
import { formatDateTime } from '../utils/date'
import { getRole } from '../utils/token'

type SortKey = 'updateAt-desc' | 'updateAt-asc' | 'createAt-desc' | 'createAt-asc'

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: '更新时间（最新）', value: 'updateAt-desc' },
  { label: '更新时间（最早）', value: 'updateAt-asc' },
  { label: '创建时间（最新）', value: 'createAt-desc' },
  { label: '创建时间（最早）', value: 'createAt-asc' },
]

const VALID_SORTS: Set<string> = new Set(SORT_OPTIONS.map(o => o.value))
const { useBreakpoint } = Grid

export default function TagListPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const isAdmin = getRole() === 'admin'
  const [searchParams, setSearchParams] = useSearchParams()
  const screens = useBreakpoint()
  const isMobile = screens.md === false

  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1') || 1)
  const pageSize = parseInt(searchParams.get('limit') ?? '10') || 10
  const search = searchParams.get('search') ?? ''
  const sort = (VALID_SORTS.has(searchParams.get('sort') ?? '') ? searchParams.get('sort')! : 'updateAt-desc') as SortKey
  const tagTypeFilter = searchParams.get('tagType') ?? undefined

  const [searchInput, setSearchInput] = useState(search)
  const [refreshKey, setRefreshKey] = useState(0)
  const [tagTypes, setTagTypes] = useState<TagType[]>([])
  const [sortBy, sortOrder] = sort.split('-') as ['updateAt' | 'createAt', 'asc' | 'desc']

  // ── Create ─────────────────────────────────────────────────────────────────
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm] = Form.useForm()

  useEffect(() => { setSearchInput(search) }, [search])

  const { items: data, total, loading } = usePagedData(
    () => api.getTags({ page, limit: pageSize, search: search || undefined, sortBy, sortOrder, tagTypeName: tagTypeFilter }),
    [page, pageSize, search, sort, tagTypeFilter, refreshKey],
    '加载标签列表失败',
  )

  useEffect(() => {
    api.getTagTypes({ page: 1, limit: 100 })
      .then(res => setTagTypes(res.items))
      .catch(() => message.error('加载标签类型失败'))
  }, [])

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleCreate = async (values: { name: string; type: string }) => {
    setCreating(true)
    try {
      await api.createTag(values.name, values.type)
      message.success('标签创建成功')
      setCreateModalOpen(false)
      createForm.resetFields()
      setRefreshKey(k => k + 1)
    } catch {
      message.error('创建失败，标签名可能已存在')
    } finally {
      setCreating(false)
    }
  }

  // ── Columns ────────────────────────────────────────────────────────────────
  const columns: TableColumnsType<TagData> = [
    { title: '标签名称', dataIndex: 'name' },
    {
      title: '标签类型',
      render: (_, record) => <Tag color="geekblue">{record.tagType.name}</Tag>,
      width: 160,
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

  const pagination: TablePaginationConfig = {
    current: page,
    pageSize,
    total,
    onChange: p => setSearchParams(prev => { prev.set('page', String(p)); return prev }, { replace: true }),
    onShowSizeChange: (_, size) => setSearchParams(prev => { prev.set('page', '1'); prev.set('limit', String(size)); return prev }, { replace: true }),
    showSizeChanger: true,
    showTotal: t => `共 ${t} 条`,
    position: ['topRight', 'bottomRight'],
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, flex: 1 }}>
          <Input
            prefix={<SearchOutlined />}
            placeholder="搜索标签名称，按回车搜索"
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
            style={{ width: isMobile ? '100%' : 300 }}
          />
          <AntSelect
            value={tagTypeFilter}
            onChange={v => setSearchParams(prev => {
              if (v) prev.set('tagType', v); else prev.delete('tagType')
              prev.set('page', '1')
              return prev
            }, { replace: true })}
            placeholder="全部类型"
            allowClear
            options={tagTypes.map(t => ({ value: t.name, label: t.name }))}
            style={{ width: isMobile ? 'calc(50% - 4px)' : 160 }}
          />
          <AntSelect
            value={sort}
            onChange={v => setSearchParams(prev => { prev.set('sort', v); prev.set('page', '1'); return prev }, { replace: true })}
            options={SORT_OPTIONS}
            style={{ width: isMobile ? 'calc(50% - 4px)' : 180 }}
          />
        </div>
        {isAdmin && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
            新建标签
          </Button>
        )}
      </div>

      <Table
        rowKey="uuid"
        dataSource={data}
        columns={columns}
        pagination={pagination}
        loading={loading}
        size="middle"
        onRow={record => ({
          onClick: () => navigate(`/tags/${record.uuid}/mangas?name=${encodeURIComponent(record.name)}`, { state: { from: location.pathname + location.search } }),
          style: { cursor: 'pointer' },
        })}
      />

      {/* Create modal */}
      <Modal
        title="新建标签"
        open={createModalOpen}
        onCancel={() => { setCreateModalOpen(false); createForm.resetFields() }}
        onOk={() => createForm.submit()}
        confirmLoading={creating}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate} style={{ marginTop: 16 }}>
          <Form.Item label="标签名称" name="name" rules={[{ required: true, message: '请输入标签名称' }]}>
            <Input placeholder="输入标签名称" />
          </Form.Item>
          <Form.Item label="标签类型" name="type" rules={[{ required: true, message: '请选择标签类型' }]}>
            <AntSelect
              placeholder="选择标签类型"
              options={tagTypes.map(t => ({ value: t.name, label: t.name }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  )
}