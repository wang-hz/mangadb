import { DeleteOutlined, KeyOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect, useState } from 'react'
import { createUser, deleteUser, getUsers } from '../api/auth'
import ChangePasswordModal from '../components/ChangePasswordModal'
import type { User } from '../types'
import { formatDate } from '../utils/date'
import { getUuid } from '../utils/token'

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [changePwTarget, setChangePwTarget] = useState<User | null>(null)
  const [form] = Form.useForm()
  const myUuid = getUuid()

  async function load() {
    setLoading(true)
    try {
      setUsers(await getUsers())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleDelete(uuid: string) {
    try {
      await deleteUser(uuid)
      setUsers(prev => prev.filter(u => u.uuid !== uuid))
    } catch {
      message.error('删除失败')
    }
  }

  async function handleCreate(values: { username: string; password: string; role: string }) {
    setSubmitting(true)
    try {
      const user = await createUser(values.username, values.password, values.role)
      setUsers(prev => [...prev, user])
      setCreateModalOpen(false)
      form.resetFields()
    } catch {
      message.error('创建失败，用户名可能已存在')
    } finally {
      setSubmitting(false)
    }
  }

  const columns: ColumnsType<User> = [
    { title: '用户名', dataIndex: 'username' },
    {
      title: '角色',
      dataIndex: 'role',
      render: role => <Tag color={role === 'admin' ? 'gold' : 'blue'}>{role === 'admin' ? '管理员' : '普通用户'}</Tag>,
    },
    { title: '创建时间', dataIndex: 'createAt', render: formatDate },
    {
      title: '操作',
      width: 120,
      render: (_, record) => (
        <Space>
          <Button
            type="text"
            icon={<KeyOutlined />}
            onClick={() => setChangePwTarget(record)}
            title="修改密码"
          />
          <Popconfirm
            title="确认删除此账号？"
            onConfirm={() => handleDelete(record.uuid)}
            disabled={record.uuid === myUuid}
          >
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              disabled={record.uuid === myUuid}
              title="删除"
            />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>用户管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
          添加账号
        </Button>
      </div>

      <Table rowKey="uuid" dataSource={users} columns={columns} loading={loading} pagination={false} />

      <Modal
        title="添加账号"
        open={createModalOpen}
        onCancel={() => { setCreateModalOpen(false); form.resetFields() }}
        onOk={() => form.submit()}
        confirmLoading={submitting}
        okText="创建"
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={form} onFinish={handleCreate} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="username" label="用户名" rules={[{ required: true }]}>
            <Input autoFocus />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true }, { min: 8, message: '密码至少 8 位' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="role" label="角色" initialValue="user" rules={[{ required: true }]}>
            <Select options={[{ value: 'user', label: '普通用户' }, { value: 'admin', label: '管理员' }]} />
          </Form.Item>
        </Form>
      </Modal>

      {changePwTarget && (
        <ChangePasswordModal
          open
          onClose={() => setChangePwTarget(null)}
          targetUuid={changePwTarget.uuid}
          isSelf={changePwTarget.uuid === myUuid}
        />
      )}
    </>
  )
}