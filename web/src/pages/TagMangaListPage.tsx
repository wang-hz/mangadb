import { ArrowLeftOutlined, CalendarOutlined, SearchOutlined, TagsOutlined } from '@ant-design/icons'
import { Button, DatePicker, Descriptions, Input, message, Modal, Select, Space, Table, Tag } from 'antd'
import dayjs from 'dayjs'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import type { Manga, Tag as TagData } from '../types'
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

const columns: TableColumnsType<Manga> = [
  { title: '显示标题', dataIndex: 'displayTitle', ellipsis: true },
  { title: '原始标题', dataIndex: 'originalTitle', ellipsis: true },
  {
    title: '出版日期',
    dataIndex: 'publishDate',
    width: 110,
    render: (v: string | null) => v ? formatDate(v) : '-',
  },
  {
    title: '创建时间',
    dataIndex: 'createAt',
    width: 160,
    render: (v: string) => formatDateTime(v),
  },
  {
    title: '更新时间',
    dataIndex: 'updateAt',
    width: 160,
    render: (v: string) => formatDateTime(v),
  },
]

export default function TagMangaListPage() {
  const { uuid } = useParams<{ uuid: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1') || 1)
  const pageSize = parseInt(searchParams.get('limit') ?? '10') || 10
  const search = searchParams.get('search') ?? ''
  const sort = (VALID_SORTS.has(searchParams.get('sort') ?? '') ? searchParams.get('sort')! : 'updateAt-desc') as `${SortBy}-${SortOrder}`

  const [tag, setTag] = useState<TagData | null>(null)
  const [data, setData] = useState<Manga[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [searchInput, setSearchInput] = useState(search)
  const [batchTagModalOpen, setBatchTagModalOpen] = useState(false)
  const [batchTagOptions, setBatchTagOptions] = useState<TagData[]>([])
  const [batchTagSearch, setBatchTagSearch] = useState('')
  const [batchSelectedTagUuid, setBatchSelectedTagUuid] = useState<string | undefined>()
  const [batchTagLoading, setBatchTagLoading] = useState(false)
  const [batchDateModalOpen, setBatchDateModalOpen] = useState(false)
  const [batchDate, setBatchDate] = useState<ReturnType<typeof dayjs> | null>(null)
  const [batchDateLoading, setBatchDateLoading] = useState(false)

  useEffect(() => { setSearchInput(search) }, [search])

  useEffect(() => {
    if (!batchTagModalOpen) return
    api.getTags({ page: 1, limit: 50, search: batchTagSearch || undefined })
      .then(res => setBatchTagOptions(res.items))
      .catch(() => message.error('加载标签失败'))
  }, [batchTagSearch, batchTagModalOpen])

  const handleBatchAddTag = async () => {
    if (!uuid || !batchSelectedTagUuid) return
    setBatchTagLoading(true)
    try {
      const { added } = await api.batchAddTagToMangasByTag(uuid, batchSelectedTagUuid)
      message.success(`已为 ${added} 部漫画添加标签`)
      setBatchTagModalOpen(false)
      setBatchSelectedTagUuid(undefined)
      setBatchTagSearch('')
    } catch {
      message.error('批量添加失败')
    } finally {
      setBatchTagLoading(false)
    }
  }

  const handleBatchSetDate = async () => {
    if (!uuid || !batchDate) return
    setBatchDateLoading(true)
    try {
      const { updated } = await api.batchSetPublishDateByTag(uuid, batchDate.format('YYYY-MM-DD'))
      message.success(`已为 ${updated} 部漫画设置出版日期`)
      setBatchDateModalOpen(false)
      setBatchDate(null)
    } catch {
      message.error('批量设置失败')
    } finally {
      setBatchDateLoading(false)
    }
  }

  useEffect(() => {
    if (!uuid) return
    api.getTag(uuid)
      .then(setTag)
      .catch(() => message.error('加载标签信息失败'))
  }, [uuid])

  useEffect(() => {
    if (!uuid) return
    const [sortBy, sortOrder] = sort.split('-') as [SortBy, SortOrder]
    setLoading(true)
    api.getMangasByTag(uuid, { page, limit: pageSize, search: search || undefined, sortBy, sortOrder })
      .then(res => { setData(res.items); setTotal(res.total) })
      .catch(() => message.error('加载漫画列表失败'))
      .finally(() => setLoading(false))
  }, [uuid, page, pageSize, search, sort])

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
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} />
      {tag && (
        <Descriptions bordered size="small" column={2}>
          <Descriptions.Item label="标签名称">{tag.name}</Descriptions.Item>
          <Descriptions.Item label="标签类型">
            <Tag color="geekblue">{tag.tagType.name}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">{formatDateTime(tag.createAt)}</Descriptions.Item>
          <Descriptions.Item label="更新时间">{formatDateTime(tag.updateAt)}</Descriptions.Item>
        </Descriptions>
      )}
      <Space style={{ justifyContent: 'space-between', width: '100%' }}>
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
        <Space>
          <Button icon={<TagsOutlined />} onClick={() => setBatchTagModalOpen(true)}>
            批量添加标签
          </Button>
          <Button icon={<CalendarOutlined />} onClick={() => setBatchDateModalOpen(true)}>
            批量设置出版日期
          </Button>
        </Space>
      </Space>
      <Modal
        title="批量添加标签"
        open={batchTagModalOpen}
        onCancel={() => { setBatchTagModalOpen(false); setBatchSelectedTagUuid(undefined); setBatchTagSearch('') }}
        onOk={handleBatchAddTag}
        okText="确认添加"
        cancelText="取消"
        confirmLoading={batchTagLoading}
        okButtonProps={{ disabled: !batchSelectedTagUuid }}
      >
        <p style={{ marginBottom: 12, color: '#666' }}>
          将选中的标签添加至「{tag?.tagType.name}: {tag?.name}」下的所有 {total} 部漫画（已有该标签的漫画会自动跳过）。
        </p>
        <Select
          style={{ width: '100%' }}
          placeholder="搜索并选择标签"
          value={batchSelectedTagUuid}
          onChange={setBatchSelectedTagUuid}
          onSearch={setBatchTagSearch}
          filterOption={false}
          showSearch
          options={batchTagOptions.map(t => ({ value: t.uuid, label: `${t.tagType.name}: ${t.name}` }))}
        />
      </Modal>
      <Modal
        title="批量设置出版日期"
        open={batchDateModalOpen}
        onCancel={() => { setBatchDateModalOpen(false); setBatchDate(null) }}
        onOk={handleBatchSetDate}
        okText="确认设置"
        cancelText="取消"
        confirmLoading={batchDateLoading}
        okButtonProps={{ disabled: !batchDate }}
      >
        <p style={{ marginBottom: 12, color: '#666' }}>
          将选中日期设置为「{tag?.tagType.name}: {tag?.name}」下所有 {total} 部漫画的出版日期。
        </p>
        <DatePicker
          style={{ width: '100%' }}
          value={batchDate}
          onChange={setBatchDate}
        />
      </Modal>
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