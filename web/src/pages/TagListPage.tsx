import { PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { Button, Form, Input, message, Modal, Select, Space, Table, Tag, Typography } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Tag as TagData, TagType } from '../types'

const { Title } = Typography

export default function TagListPage() {
  const [data, setData] = useState<TagData[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [tagTypes, setTagTypes] = useState<TagType[]>([])
  const [form] = Form.useForm()

  useEffect(() => {
    setLoading(true)
    api.getTags({ page, limit: pageSize, search: search || undefined })
      .then(res => { setData(res.items); setTotal(res.total) })
      .finally(() => setLoading(false))
  }, [page, search, refreshKey])

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
  ]

  const pagination: TablePaginationConfig = {
    current: page,
    pageSize,
    total,
    onChange: setPage,
    showTotal: t => `共 ${t} 条`,
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Space style={{ justifyContent: 'space-between', width: '100%' }}>
        <Title level={4} style={{ margin: 0 }}>标签管理</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          新建标签
        </Button>
      </Space>
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
        style={{ maxWidth: 360 }}
      />
      <Table
        rowKey="uuid"
        dataSource={data}
        columns={columns}
        pagination={pagination}
        loading={loading}
        size="middle"
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
            <Select
              placeholder="选择标签类型"
              options={tagTypes.map(t => ({ value: t.name, label: t.name }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  )
}