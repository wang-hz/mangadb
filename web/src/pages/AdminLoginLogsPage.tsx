import { CheckCircleOutlined, CloseCircleOutlined, SearchOutlined } from '@ant-design/icons'
import { Button, Input, Select, Space, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getLoginLogs } from '../api/auth'
import type { LoginLog } from '../types'
import { formatDateTime } from '../utils/date'

const PAGE_SIZE = 20

export default function AdminLoginLogsPage() {
  const { t } = useTranslation()
  const [logs, setLogs] = useState<LoginLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [usernameInput, setUsernameInput] = useState('')
  const [usernameFilter, setUsernameFilter] = useState('')
  const [successFilter, setSuccessFilter] = useState<boolean | undefined>(undefined)

  async function load(p: number, username: string, success: boolean | undefined) {
    setLoading(true)
    try {
      const result = await getLoginLogs({ page: p, limit: PAGE_SIZE, username: username || undefined, success })
      setLogs(result.items)
      setTotal(result.total)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(page, usernameFilter, successFilter) }, [page, usernameFilter, successFilter])

  function handleSearch() { setUsernameFilter(usernameInput.trim()); setPage(1) }
  function handleSuccessChange(val: boolean | undefined) { setSuccessFilter(val); setPage(1) }

  const columns: ColumnsType<LoginLog> = useMemo(() => [
    { title: t('loginLogs.time'), dataIndex: 'createdAt', width: 200, render: formatDateTime },
    { title: t('common.username'), dataIndex: 'username', width: 140 },
    {
      title: t('loginLogs.result'),
      dataIndex: 'success',
      width: 90,
      render: (success: boolean) => success
        ? <Tag icon={<CheckCircleOutlined />} color="success">{t('loginLogs.success')}</Tag>
        : <Tag icon={<CloseCircleOutlined />} color="error">{t('loginLogs.failed')}</Tag>,
    },
    { title: 'IP', dataIndex: 'ip', width: 140 },
    { title: 'User-Agent', dataIndex: 'userAgent', ellipsis: true },
  ], [t])

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>{t('loginLogs.title')}</h2>
      </div>

      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          value={usernameInput}
          onChange={e => setUsernameInput(e.target.value)}
          placeholder={t('common.username')}
          style={{ width: 180 }}
          allowClear
          onPressEnter={handleSearch}
          onClear={() => { setUsernameInput(''); setUsernameFilter(''); setPage(1) }}
        />
        <Button icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
        <Select
          style={{ width: 120 }}
          placeholder={t('loginLogs.resultPlaceholder')}
          allowClear
          onChange={(val: boolean | undefined) => handleSuccessChange(val)}
          options={[
            { value: true, label: t('loginLogs.success') },
            { value: false, label: t('loginLogs.failed') },
          ]}
        />
      </Space>

      <Table
        rowKey="id"
        dataSource={logs}
        columns={columns}
        loading={loading}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showTotal: (n: number) => t('common.total', { count: n }),
          onChange: p => setPage(p),
          showSizeChanger: false,
        }}
        scroll={{ x: 700 }}
      />
    </>
  )
}
