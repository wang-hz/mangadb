import { SearchOutlined } from '@ant-design/icons'
import { Input, message, Select, Space, Table } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import type { Manga } from '../types'
import { formatDate, formatDateTime } from '../utils/date'

type SortBy = 'updateAt' | 'createAt' | 'publishDate'
type SortOrder = 'asc' | 'desc'

const SORT_OPTIONS: { label: string; value: `${SortBy}-${SortOrder}` }[] = [
  { label: '更新时间（最新）', value: 'updateAt-desc' },
  { label: '更新时间（最早）', value: 'updateAt-asc' },
  { label: '创建时间（最新）', value: 'createAt-desc' },
  { label: '创建时间（最早）', value: 'createAt-asc' },
  { label: '出版日期（最新）', value: 'publishDate-desc' },
  { label: '出版日期（最早）', value: 'publishDate-asc' },
]

const VALID_SORTS: Set<string> = new Set(SORT_OPTIONS.map(o => o.value))

export default function MangaListPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1') || 1)
  const pageSize = parseInt(searchParams.get('limit') ?? '10') || 10
  const search = searchParams.get('search') ?? ''
  const sort = (VALID_SORTS.has(searchParams.get('sort') ?? '') ? searchParams.get('sort')! : 'updateAt-desc') as `${SortBy}-${SortOrder}`

  const [data, setData] = useState<Manga[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [searchInput, setSearchInput] = useState(search)

  useEffect(() => { setSearchInput(search) }, [search])

  useEffect(() => {
    const [sortBy, sortOrder] = sort.split('-') as [SortBy, SortOrder]
    setLoading(true)
    api.getMangas({ page, limit: pageSize, search: search || undefined, sortBy, sortOrder })
      .then(res => { setData(res.items); setTotal(res.total) })
      .catch(() => message.error('加载漫画列表失败'))
      .finally(() => setLoading(false))
  }, [page, pageSize, search, sort])

  const columns: TableColumnsType<Manga> = [
    { title: '显示标题', dataIndex: 'displayTitle', ellipsis: true },
    { title: '原始标题', dataIndex: 'originalTitle', ellipsis: true },
    {
      title: '出版日期',
      dataIndex: 'publishDate',
      width: 120,
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
