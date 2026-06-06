import { Form, Input, Modal, message } from 'antd'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { changePassword } from '../api/auth'

interface Props {
  open: boolean
  onClose: () => void
  targetUuid: string
  isSelf: boolean
}

export default function ChangePasswordModal({ open, onClose, targetUuid, isSelf }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  async function handleOk() {
    const values = await form.validateFields()
    setSubmitting(true)
    try {
      await changePassword(targetUuid, values.newPassword, isSelf ? values.currentPassword : undefined)
      message.success(t('changePw.success'))
      form.resetFields()
      onClose()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.includes('401') || msg.toLowerCase().includes('incorrect')) {
        message.error(t('changePw.wrongCurrent'))
      } else {
        message.error(t('changePw.error'))
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
      title={t('changePw.title')}
      width="min(520px, 95vw)"
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={submitting}
      okText={t('changePw.ok')}
      cancelText={t('common.cancel')}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        {isSelf && (
          <Form.Item name="currentPassword" label={t('changePw.current')} rules={[{ required: true, message: t('changePw.currentRequired') }]}>
            <Input.Password autoFocus />
          </Form.Item>
        )}
        <Form.Item
          name="newPassword"
          label={t('changePw.new')}
          rules={[{ required: true, message: t('changePw.newRequired') }, { min: 8, message: t('common.passwordMinLength') }]}
        >
          <Input.Password autoFocus={!isSelf} />
        </Form.Item>
        <Form.Item
          name="confirm"
          label={t('changePw.confirmNew')}
          dependencies={['newPassword']}
          rules={[
            { required: true, message: t('changePw.confirmRequired') },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('newPassword') === value) return Promise.resolve()
                return Promise.reject(new Error(t('common.passwordMismatch')))
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
