import { CheckCircleOutlined, CloseCircleOutlined, SearchOutlined } from '@ant-design/icons'
import { Button, Input, Select, Space, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect, useState } from 'react'
import { getLoginLogs } from '../api/auth'
import type { LoginLog } from '../types'
import { formatDateTime } from '../utils/date'

const PAGE_SIZE = 20

export default function AdminLoginLogsPage() {
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

  function handleSearch() {
    setUsernameFilter(usernameInput.trim())
    setPage(1)
  }

  function handleSuccessChange(val: boolean | undefined) {
    setSuccessFilter(val)
    setPage(1)
  }

  const columns: ColumnsType<LoginLog> = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 200,
      render: formatDateTime,
    },
    {
      title: '用户名',
      dataIndex: 'username',
      width: 140,
    },
    {
      title: '结果',
      dataIndex: 'success',
      width: 90,
      render: (success: boolean) => success
        ? <Tag icon={<CheckCircleOutlined />} color="success">成功</Tag>
        : <Tag icon={<CloseCircleOutlined />} color="error">失败</Tag>,
    },
    {
      title: 'IP',
      dataIndex: 'ip',
      width: 140,
    },
    {
      title: 'User-Agent',
      dataIndex: 'userAgent',
      ellipsis: true,
    },
  ]

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>登录日志</h2>
      </div>

      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          value={usernameInput}
          onChange={e => setUsernameInput(e.target.value)}
          placeholder="用户名"
          style={{ width: 180 }}
          allowClear
          onPressEnter={handleSearch}
          onClear={() => { setUsernameInput(''); setUsernameFilter(''); setPage(1) }}
        />
        <Button icon={<SearchOutlined />} onClick={handleSearch}>搜索</Button>
        <Select
          style={{ width: 120 }}
          placeholder="登录结果"
          allowClear
          onChange={(val: boolean | undefined) => handleSuccessChange(val)}
          options={[
            { value: true, label: '成功' },
            { value: false, label: '失败' },
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
          showTotal: t => `共 ${t} 条`,
          onChange: p => setPage(p),
          showSizeChanger: false,
        }}
        scroll={{ x: 700 }}
      />
    </>
  )
}