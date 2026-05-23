import { SearchOutlined } from '@ant-design/icons'
import { Input, Space, Table, Tag, Typography } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import type { Manga } from '../types'

const { Title } = Typography

export default function MangaListPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<Manga[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')

  useEffect(() => {
    setLoading(true)
    api.getMangas({ page, limit: pageSize, search: search || undefined, sortBy: 'updateAt', sortOrder: 'desc' })
      .then(res => { setData(res.items); setTotal(res.total) })
      .finally(() => setLoading(false))
  }, [page, pageSize, search])

  const columns: TableColumnsType<Manga> = [
    { title: '显示标题', dataIndex: 'displayTitle', ellipsis: true },
    { title: '原始标题', dataIndex: 'originalTitle', ellipsis: true },
    {
      title: '标签',
      render: (_, record) => (
        <Space wrap size={4}>
          {record.mangaTags.slice(0, 3).map(mt => (
            <Tag key={mt.tag.uuid} color="blue">{mt.tag.name}</Tag>
          ))}
          {record.mangaTags.length > 3 && <Tag>+{record.mangaTags.length - 3}</Tag>}
        </Space>
      ),
    },
    {
      title: '出版日期',
      dataIndex: 'publishDate',
      width: 110,
      render: (v: string | null) => v ? new Date(v).toLocaleDateString() : '-',
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
      <Title level={4} style={{ margin: 0 }}>漫画列表</Title>
      <Input
        prefix={<SearchOutlined />}
        placeholder="搜索显示标题或原始标题，按回车搜索"
        value={searchInput}
        onChange={e => {
          setSearchInput(e.target.value)
          if (!e.target.value) { setSearch(''); setPage(1) }
        }}
        onPressEnter={() => { setPage(1); setSearch(searchInput) }}
        allowClear
        style={{ maxWidth: 420 }}
      />
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
