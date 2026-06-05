import { DeleteOutlined, KeyOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createUser, deleteUser, getUsers } from '../api/auth'
import ChangePasswordModal from '../components/ChangePasswordModal'
import type { User } from '../types'
import { formatDate } from '../utils/date'
import { getUuid } from '../utils/token'

export default function AdminUsersPage() {
  const { t } = useTranslation()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [changePwTarget, setChangePwTarget] = useState<User | null>(null)
  const [form] = Form.useForm()
  const myUuid = getUuid()

  async function load() {
    setLoading(true)
    try { setUsers(await getUsers()) } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function handleDelete(uuid: string) {
    try {
      await deleteUser(uuid)
      setUsers(prev => prev.filter(u => u.uuid !== uuid))
    } catch {
      message.error(t('adminUsers.deleteError'))
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
      message.error(t('adminUsers.createError'))
    } finally {
      setSubmitting(false)
    }
  }

  const columns: ColumnsType<User> = useMemo(() => [
    { title: t('common.username'), dataIndex: 'username' },
    {
      title: t('common.role'),
      dataIndex: 'role',
      render: role => <Tag color={role === 'admin' ? 'gold' : 'blue'}>{role === 'admin' ? t('adminUsers.admin') : t('adminUsers.user')}</Tag>,
    },
    { title: t('common.createAt'), dataIndex: 'createAt', render: formatDate },
    {
      title: t('common.actions'),
      width: 120,
      render: (_, record) => (
        <Space>
          <Button type="text" icon={<KeyOutlined />} onClick={() => setChangePwTarget(record)} title={t('user.changePassword')} />
          <Popconfirm title={t('adminUsers.confirmDelete')} onConfirm={() => handleDelete(record.uuid)} disabled={record.uuid === myUuid}>
            <Button type="text" danger icon={<DeleteOutlined />} disabled={record.uuid === myUuid} title={t('common.delete')} />
          </Popconfirm>
        </Space>
      ),
    },
  ], [t, myUuid])

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>{t('adminUsers.title')}</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
          {t('adminUsers.addAccount')}
        </Button>
      </div>

      <Table rowKey="uuid" dataSource={users} columns={columns} loading={loading} pagination={false} />

      <Modal
        title={t('adminUsers.createTitle')}
        open={createModalOpen}
        onCancel={() => { setCreateModalOpen(false); form.resetFields() }}
        onOk={() => form.submit()}
        confirmLoading={submitting}
        okText={t('common.create')}
        cancelText={t('common.cancel')}
        destroyOnHidden
      >
        <Form form={form} onFinish={handleCreate} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="username" label={t('common.username')} rules={[{ required: true }]}>
            <Input autoFocus />
          </Form.Item>
          <Form.Item name="password" label={t('common.password')} rules={[{ required: true }, { min: 8, message: t('common.passwordMinLength') }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="role" label={t('common.role')} initialValue="user" rules={[{ required: true }]}>
            <Select options={[{ value: 'user', label: t('adminUsers.user') }, { value: 'admin', label: t('adminUsers.admin') }]} />
          </Form.Item>
        </Form>
      </Modal>

      {changePwTarget && (
        <ChangePasswordModal open onClose={() => setChangePwTarget(null)} targetUuid={changePwTarget.uuid} isSelf={changePwTarget.uuid === myUuid} />
      )}
    </>
  )
}
