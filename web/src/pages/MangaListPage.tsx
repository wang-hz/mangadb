import { AppstoreOutlined, BarsOutlined, SearchOutlined } from '@ant-design/icons'
import { Grid, Input, Pagination, Segmented, Select, Space, Table } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import MangaGrid from '../components/MangaGrid'
import { usePagedData } from '../hooks/usePagedData'
import { useViewMode } from '../hooks/useViewMode'
import type { Manga } from '../types'
import { formatDate, formatDateTime } from '../utils/date'

type SortBy = 'updateAt' | 'createAt' | 'publishDate'
type SortOrder = 'asc' | 'desc'

const VALID_SORTS = new Set([
  'updateAt-desc', 'updateAt-asc',
  'createAt-desc', 'createAt-asc',
  'publishDate-desc', 'publishDate-asc',
])

const { useBreakpoint } = Grid

export default function MangaListPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const screens = useBreakpoint()
  const isMobile = screens.md === false

  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1') || 1)
  const pageSize = parseInt(searchParams.get('limit') ?? '10') || 10
  const search = searchParams.get('search') ?? ''
  const sort = (VALID_SORTS.has(searchParams.get('sort') ?? '') ? searchParams.get('sort')! : 'updateAt-desc') as `${SortBy}-${SortOrder}`

  const [searchInput, setSearchInput] = useState(search)
  const [sortBy, sortOrder] = sort.split('-') as [SortBy, SortOrder]
  const [viewMode, handleViewModeChange] = useViewMode()

  useEffect(() => { setSearchInput(search) }, [search])

  const { items: data, total, loading } = usePagedData(
    () => api.getMangas({ page, limit: pageSize, search: search || undefined, sortBy, sortOrder }),
    [page, pageSize, search, sort],
    t('manga.loadError'),
  )

  const sortOptions = useMemo(() => [
    { label: t('sort.updateAtDesc'), value: 'updateAt-desc' },
    { label: t('sort.updateAtAsc'),  value: 'updateAt-asc' },
    { label: t('sort.createAtDesc'), value: 'createAt-desc' },
    { label: t('sort.createAtAsc'),  value: 'createAt-asc' },
    { label: t('sort.publishDateDesc'), value: 'publishDate-desc' },
    { label: t('sort.publishDateAsc'),  value: 'publishDate-asc' },
  ], [t])

  const handlePageChange = useCallback(
    (p: number) => setSearchParams(prev => { prev.set('page', String(p)); return prev }, { replace: true }),
    [setSearchParams],
  )

  const handlePageSizeChange = useCallback(
    (_: number, size: number) => setSearchParams(prev => { prev.set('page', '1'); prev.set('limit', String(size)); return prev }, { replace: true }),
    [setSearchParams],
  )

  const columns: TableColumnsType<Manga> = useMemo(() => [
    { title: t('manga.displayTitle'), dataIndex: 'displayTitle', ellipsis: true },
    ...(!isMobile ? [
      { title: t('manga.originalTitle'), dataIndex: 'originalTitle', ellipsis: true } as TableColumnsType<Manga>[number],
      { title: t('manga.publishDate'), dataIndex: 'publishDate', width: 120, render: (v: string | null) => v ? formatDate(v) : '-' } as TableColumnsType<Manga>[number],
      { title: t('common.createAt'), dataIndex: 'createAt', width: 180, render: (v: string) => formatDateTime(v) } as TableColumnsType<Manga>[number],
      { title: t('common.updateAt'), dataIndex: 'updateAt', width: 180, render: (v: string) => formatDateTime(v) } as TableColumnsType<Manga>[number],
    ] : []),
  ], [t, isMobile])

  const from = useMemo(() => location.pathname + location.search, [location.pathname, location.search])

  const onRow = useCallback(
    (record: Manga) => ({
      onClick: () => navigate(`/mangas/${record.uuid}`, { state: { from } }),
      style: { cursor: 'pointer' },
    }),
    [navigate, from],
  )

  const tablePagination: TablePaginationConfig = useMemo(() => ({
    current: page,
    pageSize,
    total,
    onChange: handlePageChange,
    onShowSizeChange: handlePageSizeChange,
    showSizeChanger: true,
    showTotal: (n: number) => t('common.total', { count: n }),
    position: ['topRight', 'bottomRight'],
  }), [page, pageSize, total, handlePageChange, handlePageSizeChange, t])

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <Input
          prefix={<SearchOutlined />}
          placeholder={t('manga.searchPlaceholder')}
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
          options={sortOptions}
          style={{ width: isMobile ? '100%' : 180 }}
        />
        <Segmented
          value={viewMode}
          onChange={v => handleViewModeChange(v as 'list' | 'grid')}
          options={[
            { value: 'list', icon: <BarsOutlined /> },
            { value: 'grid', icon: <AppstoreOutlined /> },
          ]}
        />
      </div>

      {viewMode === 'list' ? (
        <Table
          rowKey="uuid"
          dataSource={data}
          columns={columns}
          pagination={tablePagination}
          loading={loading}
          size="middle"
          onRow={onRow}
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
              showTotal={n => t('common.total', { count: n })}
            />
          </div>
          <MangaGrid data={data} loading={loading} from={from} />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Pagination
              current={page}
              pageSize={pageSize}
              total={total}
              onChange={handlePageChange}
              onShowSizeChange={handlePageSizeChange}
              showSizeChanger
              showTotal={n => t('common.total', { count: n })}
            />
          </div>
        </Space>
      )}
    </Space>
  )
}
