import { Button, Card, Form, Input, message } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { checkSetupStatus, setupFirstAdmin } from '../api/auth'

export default function SetupPage() {
  const navigate = useNavigate()
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
      message.success('管理员账号创建成功，请登录')
      navigate('/login', { replace: true })
    } catch {
      message.error('创建失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f0f2f5' }}>
      <Card title="初始化 MangaDB" style={{ width: 400 }}>
        <p style={{ color: '#666', marginBottom: 24 }}>数据库中尚无账号，请创建第一个管理员账号。</p>
        <Form onFinish={onFinish} layout="vertical" autoComplete="off">
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input autoFocus />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }, { min: 8, message: '密码至少 8 位' }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="确认密码"
            dependencies={['password']}
            rules={[
              { required: true, message: '请确认密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) return Promise.resolve()
                  return Promise.reject(new Error('两次密码不一致'))
                },
              }),
            ]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={loading} block>
              创建管理员账号
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}