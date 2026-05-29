import { AppstoreOutlined, BarsOutlined, SearchOutlined } from '@ant-design/icons'
import { Grid, Input, Pagination, Segmented, Select, Space, Table } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import MangaGrid from '../components/MangaGrid'
import { usePagedData } from '../hooks/usePagedData'
import type { Manga } from '../types'
import { formatDate, formatDateTime } from '../utils/date'

type SortBy = 'updateAt' | 'createAt' | 'publishDate'
type SortOrder = 'asc' | 'desc'
type ViewMode = 'list' | 'grid'

const SORT_OPTIONS: { label: string; value: `${SortBy}-${SortOrder}` }[] = [
  { label: '更新时间（最新）', value: 'updateAt-desc' },
  { label: '更新时间（最早）', value: 'updateAt-asc' },
  { label: '创建时间（最新）', value: 'createAt-desc' },
  { label: '创建时间（最早）', value: 'createAt-asc' },
  { label: '出版日期（最新）', value: 'publishDate-desc' },
  { label: '出版日期（最早）', value: 'publishDate-asc' },
]

const VALID_SORTS: Set<string> = new Set(SORT_OPTIONS.map(o => o.value))

const VIEW_MODE_KEY = 'mangaViewMode'
const { useBreakpoint } = Grid

export default function MangaListPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const screens = useBreakpoint()
  const isMobile = screens.md === false

  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1') || 1)
  const pageSize = parseInt(searchParams.get('limit') ?? '10') || 10
  const search = searchParams.get('search') ?? ''
  const sort = (VALID_SORTS.has(searchParams.get('sort') ?? '') ? searchParams.get('sort')! : 'updateAt-desc') as `${SortBy}-${SortOrder}`

  const [searchInput, setSearchInput] = useState(search)
  const [sortBy, sortOrder] = sort.split('-') as [SortBy, SortOrder]
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem(VIEW_MODE_KEY) as ViewMode | null) ?? 'list',
  )

  useEffect(() => { setSearchInput(search) }, [search])

  const { items: data, total, loading } = usePagedData(
    () => api.getMangas({ page, limit: pageSize, search: search || undefined, sortBy, sortOrder }),
    [page, pageSize, search, sort],
    '加载漫画列表失败',
  )

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode)
    localStorage.setItem(VIEW_MODE_KEY, mode)
  }

  const handlePageChange = (p: number) =>
    setSearchParams(prev => { prev.set('page', String(p)); return prev }, { replace: true })

  const handlePageSizeChange = (_: number, size: number) =>
    setSearchParams(prev => { prev.set('page', '1'); prev.set('limit', String(size)); return prev }, { replace: true })

  const columns: TableColumnsType<Manga> = [
    { title: '显示标题', dataIndex: 'displayTitle', ellipsis: true },
    ...(!isMobile ? [
      { title: '原始标题', dataIndex: 'originalTitle', ellipsis: true } as TableColumnsType<Manga>[number],
      {
        title: '出版日期',
        dataIndex: 'publishDate',
        width: 120,
        render: (v: string | null) => v ? formatDate(v) : '-',
      } as TableColumnsType<Manga>[number],
      {
        title: '创建时间',
        dataIndex: 'createAt',
        width: 180,
        render: (v: string) => formatDateTime(v),
      } as TableColumnsType<Manga>[number],
      {
        title: '更新时间',
        dataIndex: 'updateAt',
        width: 180,
        render: (v: string) => formatDateTime(v),
      } as TableColumnsType<Manga>[number],
    ] : []),
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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
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
          style={{ width: isMobile ? '100%' : 360 }}
        />
        <Select
          value={sort}
          onChange={v => setSearchParams(prev => { prev.set('sort', v); prev.set('page', '1'); return prev }, { replace: true })}
          options={SORT_OPTIONS}
          style={{ width: isMobile ? '100%' : 180 }}
        />
        {!isMobile && (
          <Segmented
            value={viewMode}
            onChange={v => handleViewModeChange(v as ViewMode)}
            options={[
              { value: 'list', icon: <BarsOutlined /> },
              { value: 'grid', icon: <AppstoreOutlined /> },
            ]}
          />
        )}
      </div>

      {!isMobile && viewMode === 'list' ? (
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