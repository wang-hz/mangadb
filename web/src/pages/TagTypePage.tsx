import { Space, Table, Typography } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import { useEffect, useState } from 'react'
import { api } from '../api'
import type { TagType } from '../types'

const { Title } = Typography

export default function TagTypePage() {
  const [data, setData] = useState<TagType[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => {
    setLoading(true)
    api.getTagTypes({ page, limit: pageSize })
      .then(res => { setData(res.items); setTotal(res.total) })
      .finally(() => setLoading(false))
  }, [page, pageSize])

  const columns: TableColumnsType<TagType> = [
    { title: '类型名称', dataIndex: 'name' },
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
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Title level={4} style={{ margin: 0 }}>标签类型</Title>
      <Table
        rowKey="uuid"
        dataSource={data}
        columns={columns}
        pagination={pagination}
        loading={loading}
        size="middle"
      />
    </Space>
  )
}
