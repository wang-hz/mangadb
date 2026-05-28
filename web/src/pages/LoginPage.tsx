import { Button, Card, Form, Input, message } from 'antd'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { checkSetupStatus, login } from '../api/auth'
import { sessionFromToken, setSession } from '../utils/token'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: { pathname?: string } })?.from?.pathname || '/mangas'
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    checkSetupStatus().then(({ needsSetup }) => {
      if (needsSetup) navigate('/setup', { replace: true })
    })
  }, [navigate])

  async function onFinish(values: { username: string; password: string }) {
    setLoading(true)
    try {
      const { token } = await login(values.username, values.password)
      const session = sessionFromToken(token)
      if (session) setSession(session)
      navigate(from, { replace: true })
    } catch {
      message.error('用户名或密码错误')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f0f2f5' }}>
      <Card title="MangaDB" style={{ width: 360 }}>
        <Form onFinish={onFinish} layout="vertical" autoComplete="on">
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input autoFocus autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={loading} block>
              登录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}