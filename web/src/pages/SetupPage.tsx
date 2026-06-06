import { Button, Card, Form, Input, message } from 'antd'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { checkSetupStatus, setupFirstAdmin } from '../api/auth'

export default function SetupPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    checkSetupStatus().then(({ needsSetup }) => {
      if (!needsSetup) navigate('/login', { replace: true })
    })
  }, [navigate])

  async function onFinish(values: { username: string; password: string }) {
    setLoading(true)
    try {
      await setupFirstAdmin(values.username, values.password)
      message.success(t('setup.success'))
      navigate('/login', { replace: true })
    } catch {
      message.error(t('setup.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f0f2f5' }}>
      <Card title={t('setup.title')} style={{ width: 400, maxWidth: '100vw' }}>
        <p style={{ color: '#666', marginBottom: 24 }}>{t('setup.description')}</p>
        <Form onFinish={onFinish} layout="vertical" autoComplete="off">
          <Form.Item name="username" label={t('common.username')} rules={[{ required: true, message: t('login.usernameRequired') }]}>
            <Input autoFocus />
          </Form.Item>
          <Form.Item
            name="password"
            label={t('common.password')}
            rules={[{ required: true, message: t('login.passwordRequired') }, { min: 8, message: t('common.passwordMinLength') }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            name="confirm"
            label={t('common.confirmPassword')}
            dependencies={['password']}
            rules={[
              { required: true, message: t('common.confirmPasswordRequired') },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) return Promise.resolve()
                  return Promise.reject(new Error(t('common.passwordMismatch')))
                },
              }),
            ]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={loading} block>
              {t('setup.submit')}
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
