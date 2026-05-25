import { BookOutlined, LogoutOutlined, TagOutlined, UserOutlined } from '@ant-design/icons'
import { Button, Layout, Menu } from 'antd'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { removeToken } from '../utils/token'
import { getRole } from '../utils/token'

const { Header, Content } = Layout

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const isAdmin = getRole() === 'admin'

  const selectedKey = location.pathname.startsWith('/mangas') ? 'mangas'
    : location.pathname.startsWith('/tags') ? 'tags'
    : location.pathname.startsWith('/admin') ? 'admin'
    : 'mangas'

  function handleLogout() {
    removeToken()
    navigate('/login', { replace: true })
  }

  const menuItems = [
    { key: 'mangas', icon: <BookOutlined />, label: '漫画', onClick: () => navigate('/mangas') },
    { key: 'tags', icon: <TagOutlined />, label: '标签', onClick: () => navigate('/tags') },
    ...(isAdmin ? [{ key: 'admin', icon: <UserOutlined />, label: '用户管理', onClick: () => navigate('/admin/users') }] : []),
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', padding: '0 24px', gap: 24 }}>
        <span style={{ color: 'white', fontWeight: 'bold', fontSize: '18px', whiteSpace: 'nowrap' }}>
          MangaDB
        </span>
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[selectedKey]}
          style={{ flex: 1, minWidth: 0, borderBottom: 'none' }}
          items={menuItems}
        />
        <Button
          type="text"
          icon={<LogoutOutlined />}
          onClick={handleLogout}
          style={{ color: 'rgba(255,255,255,0.65)' }}
        >
          退出
        </Button>
      </Header>
      <Content style={{
        margin: '24px',
        padding: '24px',
        background: '#fff',
        borderRadius: '8px',
        minHeight: 280,
      }}>
        <Outlet />
      </Content>
    </Layout>
  )
}