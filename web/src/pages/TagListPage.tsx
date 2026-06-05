import { PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { Button, Form, Grid, Input, message, Modal, Select as AntSelect, Space, Table, Tag } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { usePagedData } from '../hooks/usePagedData'
import type { Tag as TagData, TagType } from '../types'
import { formatDateTime } from '../utils/date'
import { getRole } from '../utils/token'

type SortKey = 'updateAt-desc' | 'updateAt-asc' | 'createAt-desc' | 'createAt-asc'

const VALID_SORTS: Set<string> = new Set(['updateAt-desc', 'updateAt-asc', 'createAt-desc', 'createAt-asc'])
const { useBreakpoint } = Grid

export default function TagListPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()
  const isAdmin = getRole() === 'admin'
  const [searchParams, setSearchParams] = useSearchParams()
  const screens = useBreakpoint()
  const isMobile = screens.md === false

  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1') || 1)
  const pageSize = parseInt(searchParams.get('limit') ?? '10') || 10
  const search = searchParams.get('search') ?? ''
  const sort = (VALID_SORTS.has(searchParams.get('sort') ?? '') ? searchParams.get('sort')! : 'updateAt-desc') as SortKey
  const tagTypeFilter = searchParams.get('tagType') ?? undefined

  const [searchInput, setSearchInput] = useState(search)
  const [refreshKey, setRefreshKey] = useState(0)
  const [tagTypes, setTagTypes] = useState<TagType[]>([])
  const [sortBy, sortOrder] = sort.split('-') as ['updateAt' | 'createAt', 'asc' | 'desc']

  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm] = Form.useForm()

  useEffect(() => { setSearchInput(search) }, [search])

  const { items: data, total, loading } = usePagedData(
    () => api.getTags({ page, limit: pageSize, search: search || undefined, sortBy, sortOrder, tagTypeName: tagTypeFilter }),
    [page, pageSize, search, sort, tagTypeFilter, refreshKey],
    t('tag.loadError'),
  )

  useEffect(() => {
    api.getTagTypes({ page: 1, limit: 100 })
      .then(res => setTagTypes(res.items))
      .catch(() => message.error(t('tag.loadTypeError')))
  }, [])

  const sortOptions = useMemo(() => [
    { label: t('sort.updateAtDesc'), value: 'updateAt-desc' },
    { label: t('sort.updateAtAsc'),  value: 'updateAt-asc' },
    { label: t('sort.createAtDesc'), value: 'createAt-desc' },
    { label: t('sort.createAtAsc'),  value: 'createAt-asc' },
  ], [t])

  const handleCreate = async (values: { name: string; type: string }) => {
    setCreating(true)
    try {
      await api.createTag(values.name, values.type)
      message.success(t('tag.createSuccess'))
      setCreateModalOpen(false)
      createForm.resetFields()
      setRefreshKey(k => k + 1)
    } catch {
      message.error(t('tag.createError'))
    } finally {
      setCreating(false)
    }
  }

  const columns: TableColumnsType<TagData> = useMemo(() => [
    { title: t('tag.name'), dataIndex: 'name' },
    { title: t('tag.type'), render: (_, record) => <Tag color="geekblue">{record.tagType.name}</Tag>, width: 160 },
    { title: t('common.createAt'), dataIndex: 'createAt', width: 180, render: (v: string) => formatDateTime(v) },
    { title: t('common.updateAt'), dataIndex: 'updateAt', width: 180, render: (v: string) => formatDateTime(v) },
  ], [t])

  const pagination: TablePaginationConfig = useMemo(() => ({
    current: page,
    pageSize,
    total,
    onChange: (p: number) => setSearchParams(prev => { prev.set('page', String(p)); return prev }, { replace: true }),
    onShowSizeChange: (_: number, size: number) => setSearchParams(prev => { prev.set('page', '1'); prev.set('limit', String(size)); return prev }, { replace: true }),
    showSizeChanger: true,
    showTotal: (n: number) => t('common.total', { count: n }),
    position: ['topRight', 'bottomRight'],
  }), [page, pageSize, total, t])

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, flex: 1 }}>
          <Input
            prefix={<SearchOutlined />}
            placeholder={t('tag.searchPlaceholder')}
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
            style={{ width: isMobile ? '100%' : 300 }}
          />
          <AntSelect
            value={tagTypeFilter}
            onChange={v => setSearchParams(prev => { if (v) prev.set('tagType', v); else prev.delete('tagType'); prev.set('page', '1'); return prev }, { replace: true })}
            placeholder={t('tag.allTypes')}
            allowClear
            options={tagTypes.map(tt => ({ value: tt.name, label: tt.name }))}
            style={{ width: isMobile ? 'calc(50% - 4px)' : 160 }}
          />
          <AntSelect
            value={sort}
            onChange={v => setSearchParams(prev => { prev.set('sort', v); prev.set('page', '1'); return prev }, { replace: true })}
            options={sortOptions}
            style={{ width: isMobile ? 'calc(50% - 4px)' : 180 }}
          />
        </div>
        {isAdmin && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
            {t('tag.create')}
          </Button>
        )}
      </div>

      <Table
        rowKey="uuid"
        dataSource={data}
        columns={columns}
        pagination={pagination}
        loading={loading}
        size="middle"
        onRow={record => ({
          onClick: () => navigate(`/tags/${record.uuid}/mangas?name=${encodeURIComponent(record.name)}`, { state: { from: location.pathname + location.search } }),
          style: { cursor: 'pointer' },
        })}
      />

      <Modal
        title={t('tag.create')}
        open={createModalOpen}
        onCancel={() => { setCreateModalOpen(false); createForm.resetFields() }}
        onOk={() => createForm.submit()}
        confirmLoading={creating}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate} style={{ marginTop: 16 }}>
          <Form.Item label={t('tag.name')} name="name" rules={[{ required: true, message: t('tag.nameRequired') }]}>
            <Input placeholder={t('tag.namePlaceholder')} />
          </Form.Item>
          <Form.Item label={t('tag.type')} name="type" rules={[{ required: true, message: t('tag.typeRequired') }]}>
            <AntSelect placeholder={t('tag.typePlaceholder')} options={tagTypes.map(tt => ({ value: tt.name, label: tt.name }))} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  )
}
