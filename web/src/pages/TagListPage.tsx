import { PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { Button, Form, Input, message, Modal, Select as AntSelect, Space, Table, Tag, Typography } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import type { Tag as TagData, TagType } from '../types'

const { Title } = Typography

type SortKey = 'updateAt-desc' | 'updateAt-asc' | 'createAt-desc' | 'createAt-asc'

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: '更新时间（最新）', value: 'updateAt-desc' },
  { label: '更新时间（最早）', value: 'updateAt-asc' },
  { label: '创建时间（最新）', value: 'createAt-desc' },
  { label: '创建时间（最早）', value: 'createAt-asc' },
]

export default function TagListPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<TagData[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [sort, setSort] = useState<SortKey>('updateAt-desc')
  const [modalOpen, setModalOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [tagTypes, setTagTypes] = useState<TagType[]>([])
  const [form] = Form.useForm()

  useEffect(() => {
    const [sortBy, sortOrder] = sort.split('-') as ['updateAt' | 'createAt', 'asc' | 'desc']
    setLoading(true)
    api.getTags({ page, limit: pageSize, search: search || undefined, sortBy, sortOrder })
      .then(res => { setData(res.items); setTotal(res.total) })
      .finally(() => setLoading(false))
  }, [page, pageSize, search, sort, refreshKey])

  useEffect(() => {
    api.getTagTypes({ page: 1, limit: 100 }).then(res => setTagTypes(res.items))
  }, [])

  const handleCreate = async (values: { name: string; type: string }) => {
    setCreating(true)
    try {
      await api.createTag(values.name, values.type)
      message.success('标签创建成功')
      setModalOpen(false)
      form.resetFields()
      setRefreshKey(k => k + 1)
    } catch {
      message.error('创建失败，标签名可能已存在')
    } finally {
      setCreating(false)
    }
  }

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
      width: 160,
      render: (v: string) => new Date(v).toLocaleString(),
    },
    {
      title: '更新时间',
      dataIndex: 'updateAt',
      width: 160,
      render: (v: string) => new Date(v).toLocaleString(),
    },
  ]

  const pagination: TablePaginationConfig = {
    current: page,
    pageSize,
    total,
    onChange: setPage,
    onShowSizeChange: (_, size) => { setPage(1); setPageSize(size) },
    showSizeChanger: true,
    showTotal: t => `共 ${t} 条`,
    position: ['topRight', 'bottomRight'],
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Space style={{ justifyContent: 'space-between', width: '100%' }}>
        <Title level={4} style={{ margin: 0 }}>标签管理</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          新建标签
        </Button>
      </Space>
      <Space>
        <Input
          prefix={<SearchOutlined />}
          placeholder="搜索标签名称，按回车搜索"
          value={searchInput}
          onChange={e => {
            setSearchInput(e.target.value)
            if (!e.target.value) { setSearch(''); setPage(1) }
          }}
          onPressEnter={() => { setPage(1); setSearch(searchInput) }}
          allowClear
          style={{ width: 300 }}
        />
        <AntSelect
          value={sort}
          onChange={v => { setPage(1); setSort(v) }}
          options={SORT_OPTIONS}
          style={{ width: 180 }}
        />
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

      <Modal
        title="新建标签"
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields() }}
        onOk={() => form.submit()}
        confirmLoading={creating}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 16 }}>
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
