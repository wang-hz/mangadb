import { ArrowLeftOutlined } from '@ant-design/icons'
import { Button, Space, Table, Typography } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import type { Manga } from '../types'

const { Title, Text } = Typography

const columns: TableColumnsType<Manga> = [
  { title: '显示标题', dataIndex: 'displayTitle', ellipsis: true },
  { title: '原始标题', dataIndex: 'originalTitle', ellipsis: true },
  {
    title: '出版日期',
    dataIndex: 'publishDate',
    width: 110,
    render: (v: string | null) => v ? new Date(v).toLocaleDateString() : '-',
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

export default function TagMangaListPage() {
  const { uuid } = useParams<{ uuid: string }>()
  const [searchParams] = useSearchParams()
  const tagName = searchParams.get('name') ?? '标签'
  const navigate = useNavigate()
  const [data, setData] = useState<Manga[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => {
    if (!uuid) return
    setLoading(true)
    api.getMangasByTag(uuid, { page, limit: pageSize })
      .then(res => { setData(res.items); setTotal(res.total) })
      .finally(() => setLoading(false))
  }, [uuid, page, pageSize])

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
      <Space>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/tags')} />
        <Title level={4} style={{ margin: 0 }}>
          标签：<Text type="secondary">{tagName}</Text>
        </Title>
      </Space>
      <Table
        rowKey="uuid"
        dataSource={data}
        columns={columns}
        pagination={pagination}
        loading={loading}
        size="middle"
        onRow={record => ({
          onClick: () => navigate(`/mangas/${record.uuid}`),
          style: { cursor: 'pointer' },
        })}
      />
    </Space>
  )
}