import { EditOutlined, DeleteOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { Button, Form, Input, message, Modal, Popconfirm, Select as AntSelect, Space, Table, Tag } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { usePagedData } from '../hooks/usePagedData'
import type { Tag as TagData, TagType } from '../types'
import { formatDateTime } from '../utils/date'

type SortKey = 'updateAt-desc' | 'updateAt-asc' | 'createAt-desc' | 'createAt-asc'

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: '更新时间（最新）', value: 'updateAt-desc' },
  { label: '更新时间（最早）', value: 'updateAt-asc' },
  { label: '创建时间（最新）', value: 'createAt-desc' },
  { label: '创建时间（最早）', value: 'createAt-asc' },
]

const VALID_SORTS: Set<string> = new Set(SORT_OPTIONS.map(o => o.value))

export default function TagListPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

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

  // ── Edit ───────────────────────────────────────────────────────────────────
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingTag, setEditingTag] = useState<TagData | null>(null)
  const [editing, setEditing] = useState(false)
  const [editForm] = Form.useForm()

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

  const openEditModal = (tag: TagData) => {
    setEditingTag(tag)
    editForm.setFieldsValue({ name: tag.name, type: tag.tagType.name })
    setEditModalOpen(true)
  }

  const handleEdit = async (values: { name: string; type: string }) => {
    if (!editingTag) return
    setEditing(true)
    try {
      await api.updateTag(editingTag.uuid, values)
      message.success('标签更新成功')
      setEditModalOpen(false)
      setRefreshKey(k => k + 1)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      message.error(msg.startsWith('409') ? '标签名已存在' : '更新失败')
    } finally {
      setEditing(false)
    }
  }

  const handleDelete = async (uuid: string) => {
    try {
      await api.deleteTag(uuid)
      message.success('标签已删除')
      setRefreshKey(k => k + 1)
    } catch {
      message.error('删除失败')
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
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space size="small" onClick={e => e.stopPropagation()}>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEditModal(record)}
          />
          <Popconfirm
            title={`删除标签「${record.name}」？`}
            description="此操作将同时移除该标签与所有漫画的关联，且不可撤销。"
            onConfirm={() => handleDelete(record.uuid)}
            okText="确认删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
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

  // ── Tag type form item (shared by create and edit modals) ──────────────────
  const tagTypeFormItem = (
    <Form.Item label="标签类型" name="type" rules={[{ required: true, message: '请选择标签类型' }]}>
      <AntSelect
        placeholder="选择标签类型"
        options={tagTypes.map(t => ({ value: t.name, label: t.name }))}
      />
    </Form.Item>
  )

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Space style={{ justifyContent: 'space-between', width: '100%' }}>
        <Space>
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
            style={{ width: 300 }}
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
            style={{ width: 160 }}
          />
          <AntSelect
            value={sort}
            onChange={v => setSearchParams(prev => { prev.set('sort', v); prev.set('page', '1'); return prev }, { replace: true })}
            options={SORT_OPTIONS}
            style={{ width: 180 }}
          />
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
          新建标签
        </Button>
      </Space>

      <Table
        rowKey="uuid"
        dataSource={data}
        columns={columns}
        pagination={pagination}
        loading={loading}
        size="middle"
        onRow={record => ({
          onClick: () => navigate(`/tags/${record.uuid}/mangas?name=${encodeURIComponent(record.name)}`),
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
          {tagTypeFormItem}
        </Form>
      </Modal>

      {/* Edit modal */}
      <Modal
        title={`编辑标签「${editingTag?.name ?? ''}」`}
        open={editModalOpen}
        onCancel={() => { setEditModalOpen(false); editForm.resetFields() }}
        onOk={() => editForm.submit()}
        confirmLoading={editing}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" onFinish={handleEdit} style={{ marginTop: 16 }}>
          <Form.Item label="标签名称" name="name" rules={[{ required: true, message: '请输入标签名称' }]}>
            <Input placeholder="输入标签名称" />
          </Form.Item>
          {tagTypeFormItem}
        </Form>
      </Modal>
    </Space>
  )
}