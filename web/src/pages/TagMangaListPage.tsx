import { AppstoreOutlined, ArrowLeftOutlined, BarsOutlined, CalendarOutlined, DeleteOutlined, SearchOutlined, TagsOutlined } from '@ant-design/icons'
import { Button, DatePicker, Descriptions, Form, Grid, Input, message, Modal, Pagination, Popconfirm, Segmented, Select, Space, Table } from 'antd'
import dayjs from 'dayjs'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import MangaGrid from '../components/MangaGrid'
import { usePagedData } from '../hooks/usePagedData'
import { useViewMode } from '../hooks/useViewMode'
import type { Manga, Tag as TagData, TagType } from '../types'
import { formatDate, formatDateTime } from '../utils/date'
import { getRole } from '../utils/token'

type SortBy = 'updateAt' | 'createAt' | 'publishDate'
type SortOrder = 'asc' | 'desc'

const VALID_SORTS: Set<string> = new Set([
  'updateAt-desc', 'updateAt-asc',
  'createAt-desc', 'createAt-asc',
  'publishDate-desc', 'publishDate-asc',
])
const { useBreakpoint } = Grid

export default function TagMangaListPage() {
  const { uuid } = useParams<{ uuid: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()
  const backTo: string = (location.state as { from?: string } | null)?.from ?? '/tags'
  const [searchParams, setSearchParams] = useSearchParams()
  const screens = useBreakpoint()
  const isMobile = screens.md === false

  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1') || 1)
  const pageSize = parseInt(searchParams.get('limit') ?? '10') || 10
  const search = searchParams.get('search') ?? ''
  const sort = (VALID_SORTS.has(searchParams.get('sort') ?? '') ? searchParams.get('sort')! : 'updateAt-desc') as `${SortBy}-${SortOrder}`

  const isAdmin = getRole() === 'admin'
  const [tag, setTag] = useState<TagData | null>(null)
  const [searchInput, setSearchInput] = useState(search)
  const [tagTypes, setTagTypes] = useState<TagType[]>([])

  const [form] = Form.useForm()
  const [isDirty, setIsDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [batchTagModalOpen, setBatchTagModalOpen] = useState(false)
  const [batchTagOptions, setBatchTagOptions] = useState<TagData[]>([])
  const [batchTagSearch, setBatchTagSearch] = useState('')
  const [batchSelectedTagUuid, setBatchSelectedTagUuid] = useState<string | undefined>()
  const [batchTagLoading, setBatchTagLoading] = useState(false)
  const [batchDateModalOpen, setBatchDateModalOpen] = useState(false)
  const [batchDate, setBatchDate] = useState<ReturnType<typeof dayjs> | null>(null)
  const [batchDateLoading, setBatchDateLoading] = useState(false)

  const [sortBy, sortOrder] = sort.split('-') as [SortBy, SortOrder]
  const [viewMode, handleViewModeChange] = useViewMode()

  useEffect(() => { setSearchInput(search) }, [search])

  useEffect(() => {
    api.getTagTypes({ page: 1, limit: 100 })
      .then(res => setTagTypes(res.items))
      .catch(() => message.error(t('tag.loadTypeError')))
  }, [])

  useEffect(() => {
    if (!uuid) return
    api.getTag(uuid)
      .then(tg => { setTag(tg); form.setFieldsValue({ name: tg.name, type: tg.tagType.name }) })
      .catch(() => message.error(t('tagDetail.loadTagError')))
  }, [uuid, form])

  useEffect(() => {
    if (!batchTagModalOpen) return
    api.getTags({ page: 1, limit: 50, search: batchTagSearch || undefined })
      .then(res => setBatchTagOptions(res.items))
      .catch(() => message.error(t('tagDetail.loadTagsError')))
  }, [batchTagSearch, batchTagModalOpen])

  const handleSave = async () => {
    if (!uuid) return
    let values: { name: string; type: string }
    try { values = await form.validateFields() } catch { return }
    setSaving(true)
    try {
      const updated = await api.updateTag(uuid, values)
      setTag(updated)
      form.setFieldsValue({ name: updated.name, type: updated.tagType.name })
      setIsDirty(false)
      message.success(t('tagDetail.updateSuccess'))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      message.error(msg.startsWith('409') ? t('tagDetail.updateConflict') : t('tagDetail.updateError'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!uuid) return
    setDeleting(true)
    try {
      await api.deleteTag(uuid)
      message.success(t('tagDetail.deleteSuccess'))
      navigate('/tags', { replace: true })
    } catch {
      message.error(t('tagDetail.deleteError'))
      setDeleting(false)
    }
  }

  const handleBatchAddTag = async () => {
    if (!uuid || !batchSelectedTagUuid) return
    setBatchTagLoading(true)
    try {
      const { added } = await api.batchAddTagToMangasByTag(uuid, batchSelectedTagUuid)
      message.success(t('tagDetail.batchAddSuccess', { count: added }))
      setBatchTagModalOpen(false)
      setBatchSelectedTagUuid(undefined)
      setBatchTagSearch('')
    } catch {
      message.error(t('tagDetail.batchAddError'))
    } finally {
      setBatchTagLoading(false)
    }
  }

  const handleBatchSetDate = async () => {
    if (!uuid || !batchDate) return
    setBatchDateLoading(true)
    try {
      const { updated } = await api.batchSetPublishDateByTag(uuid, batchDate.format('YYYY-MM-DD'))
      message.success(t('tagDetail.batchSetDateSuccess', { count: updated }))
      setBatchDateModalOpen(false)
      setBatchDate(null)
    } catch {
      message.error(t('tagDetail.batchSetDateError'))
    } finally {
      setBatchDateLoading(false)
    }
  }

  const { items: data, total, loading } = usePagedData(
    () => api.getMangasByTag(uuid!, { page, limit: pageSize, search: search || undefined, sortBy, sortOrder }),
    [uuid, page, pageSize, search, sort],
    t('manga.loadError'),
  )

  const handlePageChange = (p: number) =>
    setSearchParams(prev => { prev.set('page', String(p)); return prev }, { replace: true })

  const handlePageSizeChange = (_: number, size: number) =>
    setSearchParams(prev => { prev.set('page', '1'); prev.set('limit', String(size)); return prev }, { replace: true })

  const sortOptions = useMemo(() => [
    { label: t('sort.updateAtDesc'), value: 'updateAt-desc' },
    { label: t('sort.updateAtAsc'),  value: 'updateAt-asc' },
    { label: t('sort.createAtDesc'), value: 'createAt-desc' },
    { label: t('sort.createAtAsc'),  value: 'createAt-asc' },
    { label: t('sort.publishDateDesc'), value: 'publishDate-desc' },
    { label: t('sort.publishDateAsc'),  value: 'publishDate-asc' },
  ], [t])

  const columns: TableColumnsType<Manga> = useMemo(() => [
    { title: t('manga.displayTitle'), dataIndex: 'displayTitle', ellipsis: true },
    ...(!isMobile ? [
      { title: t('manga.originalTitle'), dataIndex: 'originalTitle', ellipsis: true } as TableColumnsType<Manga>[number],
      { title: t('manga.publishDate'), dataIndex: 'publishDate', width: 110, render: (v: string | null) => v ? formatDate(v) : '-' } as TableColumnsType<Manga>[number],
      { title: t('common.createAt'), dataIndex: 'createAt', width: 180, render: (v: string) => formatDateTime(v) } as TableColumnsType<Manga>[number],
      { title: t('common.updateAt'), dataIndex: 'updateAt', width: 180, render: (v: string) => formatDateTime(v) } as TableColumnsType<Manga>[number],
    ] : []),
  ], [t, isMobile])

  const tablePagination: TablePaginationConfig = useMemo(() => ({
    current: page,
    pageSize,
    total,
    onChange: handlePageChange,
    onShowSizeChange: handlePageSizeChange,
    showSizeChanger: true,
    showTotal: (n: number) => t('common.total', { count: n }),
    position: ['topRight', 'bottomRight'],
  }), [page, pageSize, total, t])

  const from = location.pathname + location.search

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Space style={{ justifyContent: 'space-between', width: '100%' }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(backTo, { replace: true })} />
          {isAdmin && (
            <Popconfirm
              title={t('tagDetail.confirmDeleteTitle', { name: tag?.name ?? '' })}
              description={t('tagDetail.confirmDeleteDesc')}
              onConfirm={handleDelete}
              okText={t('tagDetail.confirmDelete')}
              cancelText={t('common.cancel')}
              okButtonProps={{ danger: true }}
              disabled={!tag}
            >
              <Button danger icon={<DeleteOutlined />} loading={deleting} disabled={!tag}>
                {t('tagDetail.deleteTag')}
              </Button>
            </Popconfirm>
          )}
        </Space>
        {isAdmin && (
          <Button type="primary" loading={saving} disabled={!isDirty} onClick={handleSave}>
            {t('common.save')}
          </Button>
        )}
      </Space>

      <Form form={form} onValuesChange={() => setIsDirty(true)}>
        <Descriptions bordered size="small" column={isMobile ? 1 : 2}>
          <Descriptions.Item label={t('tag.name')}>
            <Form.Item name="name" noStyle rules={[{ required: true, message: t('tagDetail.tagNameRequired') }]}>
              <Input style={{ width: '100%' }} disabled={!isAdmin} />
            </Form.Item>
          </Descriptions.Item>
          <Descriptions.Item label={t('tag.type')}>
            <Form.Item name="type" noStyle rules={[{ required: true, message: t('tagDetail.tagTypeRequired') }]}>
              <Select style={{ width: '100%' }} options={tagTypes.map(tt => ({ value: tt.name, label: tt.name }))} disabled={!isAdmin} />
            </Form.Item>
          </Descriptions.Item>
          <Descriptions.Item label={t('common.createAt')}>{tag ? formatDateTime(tag.createAt) : '-'}</Descriptions.Item>
          <Descriptions.Item label={t('common.updateAt')}>{tag ? formatDateTime(tag.updateAt) : '-'}</Descriptions.Item>
        </Descriptions>
      </Form>

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
        {isAdmin && (
          <Button icon={<TagsOutlined />} onClick={() => setBatchTagModalOpen(true)}>
            {t('tagDetail.batchAddTag')}
          </Button>
        )}
        {isAdmin && (
          <Button icon={<CalendarOutlined />} onClick={() => setBatchDateModalOpen(true)}>
            {t('tagDetail.batchSetDate')}
          </Button>
        )}
        {!isMobile && (
          <Segmented
            value={viewMode}
            onChange={v => handleViewModeChange(v as 'list' | 'grid')}
            options={[{ value: 'list', icon: <BarsOutlined /> }, { value: 'grid', icon: <AppstoreOutlined /> }]}
          />
        )}
      </div>

      <Modal
        title={t('tagDetail.batchAddTag')}
        open={batchTagModalOpen}
        onCancel={() => { setBatchTagModalOpen(false); setBatchSelectedTagUuid(undefined); setBatchTagSearch('') }}
        onOk={handleBatchAddTag}
        okText={t('tagDetail.confirmAdd')}
        cancelText={t('common.cancel')}
        confirmLoading={batchTagLoading}
        okButtonProps={{ disabled: !batchSelectedTagUuid }}
      >
        <p style={{ marginBottom: 12, color: '#666' }}>
          {t('tagDetail.batchAddTagDesc', { type: tag?.tagType.name ?? '', name: tag?.name ?? '', count: total })}
        </p>
        <Select
          style={{ width: '100%' }}
          placeholder={t('tagDetail.searchSelectTag')}
          value={batchSelectedTagUuid}
          onChange={setBatchSelectedTagUuid}
          onSearch={setBatchTagSearch}
          filterOption={false}
          showSearch
          options={batchTagOptions.map(tg => ({ value: tg.uuid, label: `${tg.tagType.name}: ${tg.name}` }))}
        />
      </Modal>

      <Modal
        title={t('tagDetail.batchSetDate')}
        open={batchDateModalOpen}
        onCancel={() => { setBatchDateModalOpen(false); setBatchDate(null) }}
        onOk={handleBatchSetDate}
        okText={t('tagDetail.confirmSet')}
        cancelText={t('common.cancel')}
        confirmLoading={batchDateLoading}
        okButtonProps={{ disabled: !batchDate }}
      >
        <p style={{ marginBottom: 12, color: '#666' }}>
          {t('tagDetail.batchSetDateDesc', { type: tag?.tagType.name ?? '', name: tag?.name ?? '', count: total })}
        </p>
        <DatePicker style={{ width: '100%' }} value={batchDate} onChange={setBatchDate} />
      </Modal>

      {!isMobile && viewMode === 'list' ? (
        <Table
          rowKey="uuid"
          dataSource={data}
          columns={columns}
          pagination={tablePagination}
          loading={loading}
          size="middle"
          onRow={record => ({
            onClick: () => navigate(`/mangas/${record.uuid}`, { state: { from } }),
            style: { cursor: 'pointer' },
          })}
        />
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Pagination current={page} pageSize={pageSize} total={total} onChange={handlePageChange} onShowSizeChange={handlePageSizeChange} showSizeChanger showTotal={n => t('common.total', { count: n })} />
          </div>
          <MangaGrid data={data} loading={loading} from={from} />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Pagination current={page} pageSize={pageSize} total={total} onChange={handlePageChange} onShowSizeChange={handlePageSizeChange} showSizeChanger showTotal={n => t('common.total', { count: n })} />
          </div>
        </Space>
      )}
    </Space>
  )
}
