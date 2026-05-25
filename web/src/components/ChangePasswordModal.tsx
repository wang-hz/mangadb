import { Form, Input, Modal, message } from 'antd'
import { useState } from 'react'
import { changePassword } from '../api/auth'

interface Props {
  open: boolean
  onClose: () => void
  targetUuid: string
  isSelf: boolean
}

export default function ChangePasswordModal({ open, onClose, targetUuid, isSelf }: Props) {
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  async function handleOk() {
    const values = await form.validateFields()
    setSubmitting(true)
    try {
      await changePassword(targetUuid, values.newPassword, isSelf ? values.currentPassword : undefined)
      message.success('密码已修改')
      form.resetFields()
      onClose()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.includes('401') || msg.toLowerCase().includes('incorrect')) {
        message.error('当前密码错误')
      } else {
        message.error('修改失败，请重试')
      }
    } finally {
      setSubmitting(false)
    }
  }

  function handleCancel() {
    form.resetFields()
    onClose()
  }

  return (
    <Modal
      title="修改密码"
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={submitting}
      okText="确认修改"
      cancelText="取消"
      destroyOnHidden
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        {isSelf && (
          <Form.Item name="currentPassword" label="当前密码" rules={[{ required: true, message: '请输入当前密码' }]}>
            <Input.Password autoFocus />
          </Form.Item>
        )}
        <Form.Item
          name="newPassword"
          label="新密码"
          rules={[{ required: true, message: '请输入新密码' }, { min: 8, message: '密码至少 8 位' }]}
        >
          <Input.Password autoFocus={!isSelf} />
        </Form.Item>
        <Form.Item
          name="confirm"
          label="确认新密码"
          dependencies={['newPassword']}
          rules={[
            { required: true, message: '请确认新密码' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('newPassword') === value) return Promise.resolve()
                return Promise.reject(new Error('两次密码不一致'))
              },
            }),
          ]}
        >
          <Input.Password />
        </Form.Item>
      </Form>
    </Modal>
  )
}