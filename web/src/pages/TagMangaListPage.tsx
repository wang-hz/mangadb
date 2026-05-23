import { ArrowLeftOutlined, SearchOutlined } from '@ant-design/icons'
import { Button, Descriptions, Input, Select, Space, Table, Tag } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import type { Manga, Tag as TagData } from '../types'

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
  const navigate = useNavigate()
  const [tag, setTag] = useState<TagData | null>(null)
  const [data, setData] = useState<Manga[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [sort, setSort] = useState<`${SortBy}-${SortOrder}`>('updateAt-desc')

  useEffect(() => {
    if (!uuid) return
    api.getTag(uuid).then(setTag)
  }, [uuid])

  useEffect(() => {
    if (!uuid) return
    const [sortBy, sortOrder] = sort.split('-') as [SortBy, SortOrder]
    setLoading(true)
    api.getMangasByTag(uuid, { page, limit: pageSize, search: search || undefined, sortBy, sortOrder })
      .then(res => { setData(res.items); setTotal(res.total) })
      .finally(() => setLoading(false))
  }, [uuid, page, pageSize, search, sort])

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
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/tags')} />
      {tag && (
        <Descriptions bordered size="small" column={2}>
          <Descriptions.Item label="标签名称">{tag.name}</Descriptions.Item>
          <Descriptions.Item label="标签类型">
            <Tag color="geekblue">{tag.tagType.name}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">{new Date(tag.createAt).toLocaleString()}</Descriptions.Item>
          <Descriptions.Item label="更新时间">{new Date(tag.updateAt).toLocaleString()}</Descriptions.Item>
        </Descriptions>
      )}
      <Space>
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
          style={{ width: 360 }}
        />
        <Select
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
          onClick: () => navigate(`/mangas/${record.uuid}`),
          style: { cursor: 'pointer' },
        })}
      />
    </Space>
  )
}